const express = require("express");
const app = express();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const cors = require("cors");
require("dotenv").config();
const port = process.env.PORT || 5000;

// Middle ware
app.use(express.json());
app.use(cors());

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const uri = `mongodb+srv://${process.env.USER_NAME}:${process.env.PASSWORD}@cluster0.1ekltq6.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // collection
    const userCollection = client.db("scic-bimanDB").collection("users");

    // User Collection
    // Post User
    app.post("/users", async (req, res) => {
      try {
        const users = req.body;
        const query = { phone: users.phone };
        const findUser = await userCollection.findOne(query);
        console.log(findUser);

        if (findUser) {
          return res.send({ message: "Number Already Exist" });
        }

        const createUser = await userCollection.insertOne(users);

        res.send(createUser);
      } catch (error) {
        res.status(500).send(error.message);
      }
    });

    // Get User
    app.get("/user", async (req, res) => {
      const phone = req.query.phone;
      const pin = req.query.pin;
      const query = { phone: parseInt(phone), pin: parseInt(pin) };

      const user = await userCollection.findOne(query);

      if (!user) {
        return res.send({ message: "User Not Found" });
      }
      res.send(user);
    });

    // Get All User
    app.get("/users", async (req, res) => {
      const allUser = await userCollection.find().toArray();
      res.send(allUser);
    });

    // Update Status
    app.put("/users/status/:id", async (req, res) => {
      const { id } = req.params;
      console.log(id);
      const { status } = req.body;
      const query = { _id: new ObjectId(id) };
      let balance = 0;

      const findUser = await userCollection.findOne(query);
      if (findUser.role === "user") {
        balance = 40;
      }
      if (findUser.role === "agent") {
        balance = 8000;
      }

      console.log(findUser);

      const updatedDoc = {
        $set: {
          status,
          balance,
        },
      };

      console.log(updatedDoc);
      const updateUser = await userCollection.updateOne(query, updatedDoc);
      res.send(updateUser);
    });

    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Biman Server is Running");
});

app.listen(port, () => {
  console.log(`port is Running at ${port}`);
});
