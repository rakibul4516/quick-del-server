const express = require('express');
const app = express();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config()
const cors = require('cors');
const jwt = require('jsonwebtoken')
const cookieParser = require('cookie-parser');
const stripe = require('stripe')(process.env.STRIPE_PAYMENT_SECRET)
const port = process.env.PORT || 5000;



app.use(cors({
    origin: ['http://localhost:5173'],
    credentials: true
}));
app.use(express.json());
app.use(cookieParser())

// token verify
const verifyToken = (req, res, next) => {
    const token = req?.cookies?.token;
    if (!token) {
        return res.status(401).send({ message: 'unauthorized access' })
    }
    jwt.verify(token, process.env.JWT_SECRET_KEY, (err, decoded) => {
        if (err) {
            return res.status(401).send({ message: 'unauthorized access' })
        }
        req.user = decoded;
        next()
    })
}


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.ufdhagf.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        // await client.connect();

        //Database collections
        const userCollections = client.db('Quick-Del').collection('users')
        const parcelCollections = client.db('Quick-Del').collection('parcels')
        const reviewCollections = client.db('Quick-Del').collection('reviews')


        app.post('/api/v1/jwt', async (req, res) => {
            const user = req.body
            const token = jwt.sign(user, process.env.JWT_SECRET_KEY, { expiresIn: '10h' })
            res.cookie('token', token, {
                httpOnly: true,
                secure: true,
                sameSite: 'none'
            })
                .send({ success: true })
        })

        app.post('/api/v1/logout', async (req, res) => {
            const user = req.body;
            res.clearCookie('token', { maxAge: 0 }).send({ success: true })
        })


        //Store user data 
        app.post('/api/v1/users', async (req, res) => {
            const user = req.body;
            const result = await userCollections.insertOne(user)
            res.send(result)
        })


        //Store parcel data 
        app.post('/api/v1/parcels', async (req, res) => {
            const parcel = req.body;
            const result = await parcelCollections.insertOne(parcel)
            res.send(result)
        })
        //Store Review data 
        app.post('/api/v1/reviews', async (req, res) => {
            const review = req.body;
            const result = await reviewCollections.insertOne(review)
            res.send(result)
        })

        //Use Payment method by Post 
        app.post('/api/v1/create-payment-intent', async (req, res) => {
            const { totalPrice } = req.body;
            console.log(totalPrice)
            const amount = parseInt(totalPrice * 100);
            if (amount < 1) {
                return
            }
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: 'usd',
                payment_method_types: ['card']
            })
            res.send({
                clientSecret: paymentIntent.client_secret
            })
        })


        //Get user data 
        app.get('/api/v1/users', verifyToken, async (req, res) => {
            const userEmail = req.query.email;
            const jwtEmail = req.user.email;
            if (userEmail !== jwtEmail) {
                return res.status(403).send({ message: 'Forbidden Access' })
            }
            const query = {}
            if (userEmail) {
                query.email = userEmail;
            }

            const result = await userCollections.find(query).toArray()
            res.send(result)
        })

        //Get alluser data
        app.get('/api/v1/allusers', async (req, res) => {
            try {
                const role = req.query.role;
                console.log(role);
                const query = { role: role };

                // Pagination 
                const page = Number(req.query.page);
                console.log(page);
                const limit = Number(req.query.limit);
                console.log(limit);
                const skip = (page - 1) * limit;
                const cursor = userCollections.find(query).skip(skip).limit(limit);
                const result = await cursor.toArray();
                console.log(result)
                res.send(result);
            } catch (error) {
                console.error('Error retrieving users:', error);
                res.status(500).send('Internal Server Error');
            }
        });

        //get review data 
        app.get('/api/v1/reviews', async (req, res) => {
            const id = req.query.id;
            const query = {}
            if (id) {
                query.deliverymenId = id
            }

            const result = await reviewCollections.find(query).toArray()
            res.send(result)
        })

        // Get method for parcels
        app.get('/api/v1/parcels', async (req, res) => {
            const cursor = parcelCollections.find();
            const result = await cursor.toArray()
            res.send(result)
        })

        //Get single parcel for update
        app.get('/api/v1/parcels/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await parcelCollections.find(query).toArray()
            res.send(result)
        })
        //count data 
        app.get('/api/v1/countusers', async (req, res) => {
            const count = await userCollections.estimatedDocumentCount();
            res.send({ count })
        })

        //Get all parcels 
        app.get('/api/v1/allparcels', async (req, res) => {
            const parcelStatus = req.query.parcelStatus;
            console.log(parcelStatus)
            const role = req.query.role;
            console.log(role)
            const userEmail = req.query.email;
            console.log(userEmail)

            const query = {};

            if (userEmail) {
                query.email = userEmail;
            }
            if (parcelStatus) {
                query.status = parcelStatus;
            }


            const result = await parcelCollections.find(query).toArray()
            res.send(result)
        })

        //Get user parcels data
        app.get('/api/v1/parcels', verifyToken, async (req, res) => {
            const userEmail = req.query.email;
            const role = req.query.role;
            const jwtEmail = req.user.email;
            if (userEmail !== jwtEmail) {
                return res.status(403).send({ message: 'Forbidden Access' })
            }
            const query = {}
            if (userEmail && role === 'user') {
                query.email = userEmail;
            }

            const result = await parcelCollections.find(query).toArray()
            res.send(result)
        })


        //Update delivery man id and date into parcels
        app.put('/api/v1/parcels/:id', async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const options = { upsert: true };
            const modifyData = req.body;
            const foods = {
                $set: {
                    deliveryAddress: modifyData.deliveryAddress,
                    deliveryDate: modifyData.deliveryDate,
                    email: modifyData.email,
                    latitude: modifyData.latitude,
                    longitude: modifyData.longitude,
                    parcelType: modifyData.parcelType,
                    parcelWeight: modifyData.parcelWeight,
                    phoneNumber: modifyData.phoneNumber,
                    price: modifyData.price,
                    receiverName: modifyData.receiverName,
                    receiverNumber: modifyData.receiverNumber,
                    senderName: modifyData.senderName,
                    deliverymen: modifyData.deliverymen,
                    assignDate: modifyData.assignDate,
                    status: modifyData.status,
                }
            };
            const result = await parcelCollections.updateOne(filter, foods, options)
            res.send(result)
        })

        //Update delivery man id and date into parcels
        app.patch('/api/v1/users/:id', async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const modifyData = req.body;

            const update = {
                $set: {
                    totalDeliver: modifyData.totalDeliver,
                },
            };

            const result = await userCollections.updateOne(filter, update);
            res.send(result);
        });
        //Update delivery man id and date into parcels
        app.patch('/api/v1/user/:id', async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const modifyData = req.body;

            const update = {
                $set: {
                    image: modifyData.userImage,
                    // totalReviews: modifyData.totalReview
                },
            };

            const result = await userCollections.updateOne(filter, update);
            res.send(result);
        });



        //Update make delivery man  and admin
        app.patch('/api/v1/user/:id', async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const modifyData = req.body;

            const update = {
                $set: {
                    role: modifyData.setrole
                },
            };

            const result = await userCollections.updateOne(filter, update);
            res.send(result);
        });







        //Count average rating and user data 






        // Send a ping to confirm a successful connection
        // await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);



app.get('/', (req, res) => {
    res.send('QuickDel server is running')
});


app.listen(port, () => {
    console.log(`QuickDel server is running on port no: ${port}`)
})