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

      try {
        const user = await userCollection.findOne(query);

        const isMatch = bcrypt.compareSync(toString(pin), user.pin);

        if (!isMatch) {
          return res.status(404).send({ message: "User Not Found" });
        }

        res.status(200).send(user);
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    });

    // Get All User for Admin
    app.get("/users", async (req, res) => {
      try {
        const allUser = await userCollection.find().toArray();
        res.status(200).send(allUser);
      } catch (error) {
        res.status(500).send(error.message);
      }
    });

    // Update Status
    app.put("/users/status/:id", async (req, res) => {
      const { id } = req.params;
      console.log(id);
      const { status } = req.body;
      const query = { _id: new ObjectId(id) };
      let balance = 0;

      try {
        const findUser = await userCollection.findOne(query);
        if (findUser.role === "user") {
          balance = 40;
        }
        if (findUser.role === "agent") {
          balance = 8000;
        }

        const updatedDoc = {
          $set: {
            status,
            balance,
          },
        };

        const updateUser = await userCollection.updateOne(query, updatedDoc);
        res.status(200).send(updateUser);
      } catch (error) {
        res.status(500).send(error.message);
      }
    });

    // Send Money
    app.put("/send-money/:phone", async (req, res) => {
      const senderPhone = parseInt(req.params.phone);
      const { receiverPhone, pin, balance } = req.body;

      // if (senderFind.balance < balance) {
      //   return res.status(400).send("Insufficient balance");
      // }

      try {
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

        // Start a transaction
        const session = client.startSession();
        session.startTransaction();

        // Update receiver's balance
        const updatedReceiver = await userCollection.updateOne(
          { phone: parseInt(receiverPhone) },
          { $inc: { balance: parseFloat(balance) } },
          { $push: { transition: { transitionNo: senderPhone, transitionBalance: parseFloat(balance), requestStatus: "received" } } },
          { session }
        );

        // Update sender's balance
        const updatedSender = await userCollection.updateOne(
          { phone: senderPhone },
          { $inc: { balance: -parseFloat(balance) } },
          {
            $push: {
              transition: { transitionNo: parseInt(receiverPhone), transitionBalance: parseFloat(balance), requestStatus: "send money" },
            },
          },
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

    // Cash Out
    app.put("/cash-out/:phone", async (req, res) => {
      const userPhone = parseInt(req.params.phone);
      const { phone, balance, pin } = req.body;
      const agentNumber = parseInt(phone);
      const cashOut = parseFloat(balance);
      const userPin = toString(pin);

      try {
        const findUser = await userCollection.findOne({ phone: userPhone });
        const findAgent = await userCollection.findOne({ phone: agentNumber });

        const isMatch = bcrypt.compareSync(userPin, findUser.pin);

        if (!isMatch) {
          return res.status(504).send({ message: "Unauthorize Access!" });
        }

        if (findAgent.role !== "agent") {
          return res.status(400).send({ message: "Agent not found!" });
        }

        await userCollection.updateOne(
          { phone: userPhone },
          { $inc: { balance: -cashOut } },
          { $push: { transition: { transitionNo: agentNumber, transitionBalance: cashOut, requestStatus: "cash out" } } }
        );

        const updateAgent = await userCollection.updateOne(
          { phone: agentNumber },
          { $inc: { balance: cashOut } },
          { $push: { transition: { transitionNo: userPhone, transitionBalance: cashOut, requestStatus: "received" } } }
        );

        res.status(200).send(updateAgent);
      } catch (error) {
        res.status(500).send(error.message);
      }
    });

    // Cash In
    app.put("/cash-in/:phone", async (req, res) => {
      const user = parseInt(req.params.phone);
      const { agentNumber, requestBalance, pin } = req.body;
      const agent = parseInt(agentNumber);
      const requestedBalance = parseFloat(requestBalance);
      const userPin = toString(pin);

      try {
        const getUser = await userCollection.findOne({ phone: user });
        const getAgent = await userCollection.findOne({ phone: agent });

        const isMatch = bcrypt.compareSync(userPin, getUser.pin);

        if (!isMatch) {
          return res.status(504).send({ message: "Unauthorize Access" });
        }

        if (getAgent.role !== "agent") {
          return res.status(404).send({ message: "Agent Not Found." });
        }

        // transition
        await userCollection.updateOne(
          { phone: agent },
          { $push: { transition: { transitionNo: agent, transitionBalance: requestedBalance, requestStatus: "pending" } } }
        );

        const updateAgent = await userCollection.updateOne(
          { phone: agent },
          { $push: { cashInRequest: { requestNumber: user, requestedBalance, requestedStatus: "pending" } } }
        );

        res.status(200).send(updateAgent);
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    });

    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Biman Server is Running");
});

app.listen(port, () => {
  console.log(`port is Running at ${port}`);
});
