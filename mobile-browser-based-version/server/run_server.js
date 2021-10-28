const { models }            = require('./models.js');
const { averageWeights }    = require('./tfjs_helpers.js');
const express               = require('express');
const fs                    = require('fs');
const cors                  = require('cors');
const path                  = require('path');
const { type }              = require('os');
const msgpack               = require('msgpack-lite');

// Fraction of peers required to complete communication round
const PEERS_THRESHOLD = 0.8;
// Save the weights for a task every X rounds
const MODEL_SAVE_TIMESTEP = 5;
const INVALID_REQUEST_FORMAT_MESSAGE = "Please pecify a client ID, round number and task ID.";
const INVALID_REQUEST_KEYS_MESSAGE = "No entry matches the given keys.";

const app = express();
app.enable('trust proxy');
app.use(cors());
app.use(express.json({limit: '50mb'}));
app.use(express.urlencoded({limit: '50mb', extended: false}));
const server = app.listen(8081); // Different port from Vue client

// Server-side data structures
const weightsDict = {};
const dataDict = {};
const logs = {};
let peers = [];


function isValidRequest(request) {
  const body = request.body;
  return body !== undefined &&
         body.id !== undefined && typeof body.id === 'string' && peers.includes(body.id) &&
         body.timestamp !== undefined && typeof body.timestamp === 'string';
}

function logsAppend(request, type) {
  const id = request.body.id;
  const timestamp = request.body.timestamp;
  const task = request.params.task;
  const round = request.params.round;

  if (!(id in logs)) {
    logs[id] = {};
  }
  if (!(task in logs[id])) {
    logs[id][task] = {};
  }
  if (!(round in logs[id][task])) {
    logs[id][task][round] = [];
  }
  logs[id][task][round].push({timestamp: timestamp, request: type});
}

function queryLogs(request, response) {
  const id = request.params.id;
  const task = request.params.task;
  const round = request.params.round;

  response.status(200);
  if (id === undefined) {
    response.send(logs);
    return;
  }
  if (id in logs && task === undefined) {
    response.send(logs[id]);
    return;
  }
  if (id in logs && task in logs[id] && round === undefined) {
    response.send(logs[id][task]);
    return;
  }
  if (id in logs && task in logs[id] && round in logs[id][task]) {
    response.send(logs[id][task][round]);
    return;
  }
  response.status(404).send(INVALID_REQUEST_KEYS_MESSAGE);
}

function sendWeights(request, response) {
  const requestType = 'SEND_weights';

  if (!isValidRequest(request)) {
    response.status(400).send(INVALID_REQUEST_FORMAT_MESSAGE);
    console.log(`${requestType} failed`);
    return;
  }

  const id = request.body.id;
  const timestamp = request.body.timestamp;
  const round = request.params.round;
  const task = request.params.task;


  if (!(task in weightsDict)) {
    weightsDict[task] = {};
  }
  if (!(round in weightsDict[task])) {
    weightsDict[task][round] = {};
  }

  const weights = msgpack.decode(Uint8Array.from(request.body.weights.data));
  weightsDict[task][round][id] = weights;
  response.status(200).send("Weights successfully received.");

  logsAppend(request, requestType);
  return;
}

async function receiveWeights(request, response) {
  const requestType = 'RECEIVE_weights';

  if (!isValidRequest(request)) {
    response.status(400).send(INVALID_REQUEST_FORMAT_MESSAGE);
    console.log(`${requestType} failed`);
    return;
  }

  const id = request.body.id;
  const timestamp = request.body.timestamp;
  const task = request.params.task;
  const round = request.params.round;

  if (!(task in weightsDict && round in weightsDict[task])) {
    response.status(404).send(INVALID_REQUEST_KEYS_MESSAGE);
    console.log(`${requestType} failed`);
    return;
  }

  logsAppend(request, requestType);

  const receivedWeights = weightsDict[task][round]
  if (Object.keys(receivedWeights).length < Math.ceil(peers.length * PEERS_THRESHOLD)) {
    response.status(200).send({});
    return;
  }

  // TODO: use proper average of model weights (can be copied from the frontend)
  const serializedWeights = await averageWeights(Object.values(receivedWeights));
  const weightsJson = JSON.stringify(serializedWeights);

  if ((round - 1) % MODEL_SAVE_TIMESTEP == 0) {
    const weightsPath = `${task}_${round}_weights.json`;
    const milestonesPath = path.join(__dirname, 'milestones');
    if (!fs.existsSync(milestonesPath)) {
      fs.mkdirSync(milestonesPath);
    }
    fs.writeFile(path.join(milestonesPath, weightsPath), weightsJson, (err) => {
      if (err) {
        console.log(err);
        console.log(`Failed to save weights to ${weightsPath}`);
      } else {
        console.log(`Weights saved to ${weightsPath}`);
      }
    });
  }

  let weights = msgpack.encode(Array.from(serializedWeights));
  response.status(200).send({weights: weights});
  return;
}

function sendDataInfo(request, response) {
  const requestType = 'SEND_data_info';

  if (!isValidRequest(request)) {
    response.status(400).send(INVALID_REQUEST_FORMAT_MESSAGE);
    console.log(`${requestType} failed`);
    return;
  }

  const id = request.body.id;
  const timestamp = request.body.timestamp;
  const samples = request.body.samples;
  const task = request.params.task;
  const round = request.params.round;

  if (!(task in dataDict)) {
    dataDict[task] = {};
  }
  if (!(round in dataDict)) {
    dataDict[task][round] = {};
  }
  dataDict[task][round][id] = samples;
  response.status(200).send("Number of samples successfully received.");

  logsAppend(request, requestType);
  return;
}

function receiveDataInfo(request, response) {
  const requestType = 'RECEIVE_data_info';

  if (!isValidRequest(request)) {
    response.status(400).send(INVALID_REQUEST_FORMAT_MESSAGE);
    console.log(`${requestType} failed`);
    return;
  }

  const body = request.body;
  const id = body.id;
  const timestamp = body.timestamp;
  const task = request.params.task;
  const round = request.params.round;

  if (!(task in dataDict && round >= 0)) {
    response.status(404).send(INVALID_REQUEST_KEYS_MESSAGE);
    console.log(`${requestType} failed`);
    return;
  }

  const latestDataDict = {};
  // For each round...
  for (let data of Object.values(dataDict[task])) {
    // ... fetch the latest entry
    for (let [id, samples] of Object.entries(data)) {
      latestDataDict[id] = samples;
    }
  }

  /* Code for computing data percentages, left to client
  const totalSamples = Object.values(latestDataDict).reduce((a, b) => {
    a + b
  });

  // Map values
  const dataShares = {};
  for (let [id, samples] of Object.entries(latestDataDict)) {
    dataShares[id] = samples / totalSamples;
  }
  */

  response.status(200).send(latestDataDict);

  logsAppend(request, requestType);
  return;
}

function getTasks(req, res) {
  const tasksPath = path.join(__dirname, 'tasks.json');
  if (fs.existsSync(tasksPath)) {
    console.log(`Serving ${tasksPath}`);
    res.status(200).sendFile(tasksPath);
  } else {
    res.status(400).send({});
  }
}

function getTaskModel(req, res) {
  const modelFiles = ['model.json', 'weights.bin'];
  const modelPath = path.join(__dirname, req.params.id, req.params.file);
  console.log(`File path: ${modelPath}`)
  if (modelFiles.includes(req.params.file) && fs.existsSync(modelPath)) {
    console.log(`${req.params.file} download for task ${req.params.id} succeeded`)
    res.status(200).sendFile(modelPath);
  } else {
    res.status(400).send({});
  }
}

// Create and save Tensorflow models
Promise.all(models.map((createModel) => createModel()));

// Configure server routing
const tasksRouter = express.Router();
tasksRouter.get('/', getTasks);
tasksRouter.get('/:id/:file', getTaskModel);

app.get('/connect/:task/:id', (req, res) => {
  peers.push(req.params.id);
  console.log(`Peer connected: ${req.params.id}`);
  res.send("Successfully connected.");
});
app.get('/disconnect/:task/:id', (req, res) => {
  peers = peers.filter(val => (val != req.params.id));
  console.log(`Peer disconnected: ${req.params.id}`);
  res.send("Successfully disconnected.");
});

app.post('/send_weights/:task/:round', sendWeights);
app.post('/receive_weights/:task/:round', receiveWeights);

app.post('/send_data_info/:task/:round', sendDataInfo);
app.post('/receive_data_info/:task/:round', receiveDataInfo);

app.get('/logs/:id?/:task?/:round?', queryLogs);

app.get('/', (req, res) => res.send("FeAI Server"));

app.use('/tasks', tasksRouter);

module.exports = app;
