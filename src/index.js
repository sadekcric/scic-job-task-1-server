const express = require("express");
const app = express();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const cors = require("cors");
require("dotenv").config();
const bcrypt = require("bcryptjs");
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
        const users = await req.body;
        const query = { phone: users.phone };
        const findUser = await userCollection.findOne(query);
        const pin = toString(users.pin);
        console.log(pin);

        const hash = bcrypt.hashSync(pin, 8);

        if (findUser) {
          return res.send({ message: "Number Already Exist" });
        }

        const createUser = await userCollection.insertOne({ ...users, pin: hash });

        res.send(createUser);
      } catch (error) {
        res.status(500).send(error.message);
      }
    });

    // Get User
    app.get("/user", async (req, res) => {
      const phone = req.query.phone;
      const pin = req.query.pin;

      const query = { phone: parseInt(phone) };

      const user = await userCollection.findOne(query);

      const isMatch = bcrypt.compareSync(toString(pin), user.pin);

      if (!isMatch) {
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

    // Send Money
    // app.put("/send-money/:phone", async (req, res) => {
    //   const senderPhone = parseInt(req.params.phone);
    //   const query = { phone: senderPhone };
    //   const { receiverPhone, pin, balance } = req.body;

    //   const senderFind = await userCollection.findOne(query);
    //   const receiverFind = await userCollection.findOne({ phone: parseInt(receiverPhone) });

    //   const isMatch = bcrypt.compareSync(toString(pin), senderFind.pin);

    //   if (!isMatch) {
    //     return res.send({ message: "Phone no and password don't match!" });
    //   }

    //   if (!receiverFind) {
    //     return res.status(404).send("Receiver not found");
    //   }

    //   await userCollection.updateOne({ phone: parseInt(receiverPhone) }, { $inc: { balance: balance } });

    //   const updatedSender = await userCollection.updateOne({ phone: senderPhone }, { $inc: { balance: -(balance + 5) } });

    //   res.send(updatedSender);
    // });

    // Send Money
    app.put("/send-money/:phone", async (req, res) => {
      const senderPhone = parseInt(req.params.phone);
      const { receiverPhone, pin, balance } = req.body;

      if (!receiverPhone || !pin || !balance) {
        return res.status(400).send("Receiver phone, pin, and balance are required");
      }

      const senderFind = await userCollection.findOne({ phone: senderPhone });
      const receiverFind = await userCollection.findOne({ phone: parseInt(receiverPhone) });

      if (!senderFind) {
        return res.status(404).send({ message: "Sender not found" });
      }

      if (!receiverFind) {
        return res.status(404).send("Receiver not found");
      }

      const isMatch = bcrypt.compareSync(toString(pin), senderFind.pin);

      if (!isMatch) {
        return res.status(401).send({ message: "Phone number and pin don't match" });
      }

      // if (senderFind.balance < balance + 5) {
      //   return res.status(400).send("Insufficient balance");
      // }

      try {
        // Start a transaction
        const session = client.startSession();
        session.startTransaction();

        // Update receiver's balance
        const updatedReceiver = await userCollection.updateOne(
          { phone: parseInt(receiverPhone) },
          { $inc: { balance: parseFloat(balance) } },
          { session }
        );

        // Update sender's balance
        const updatedSender = await userCollection.updateOne(
          { phone: senderPhone },
          { $inc: { balance: balance > 100 ? -(parseFloat(balance) + 5) : -parseFloat(balance) } },
          { session }
        );

        if (updatedReceiver.modifiedCount === 0 || updatedSender.modifiedCount === 0) {
          await session.abortTransaction();
          session.endSession();
          return res.status(500).send("Transaction failed");
        }

        await session.commitTransaction();
        session.endSession();

        res.status(200).send({ message: "Transaction successful" });
      } catch (error) {
        console.error("Error during transaction:", error);
        res.status(500).send("Internal Server Error");
      }
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
