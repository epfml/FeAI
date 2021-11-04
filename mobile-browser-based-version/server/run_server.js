const { models }            = require('./models.js');
const { averageWeights }    = require('./tfjs_helpers.js');
const express               = require('express');
const fs                    = require('fs');
const cors                  = require('cors');
const path                  = require('path');
const { type }              = require('os');
const msgpack               = require('msgpack-lite');


// JSON file containing all the tasks metadata
const TASKS_FILE = 'tasks.json'
// Fraction of client reponses required to complete communication round
const CLIENTS_THRESHOLD = 0.8;
// Save the averaged weights of each task to local storage every X rounds
const MODEL_SAVE_TIMESTEP = 5;
// Common error messages
const INVALID_REQUEST_FORMAT_MESSAGE = 'Please pecify a client ID, round number and task ID.';
const INVALID_REQUEST_KEYS_MESSAGE = 'No entry matches the given keys.';


const app = express();
app.enable('trust proxy');
app.use(cors());
app.use(express.json({limit: '50mb'}));
app.use(express.urlencoded({limit: '50mb', extended: false}));
const server = app.listen(8081); // Different port from Vue client

/**
 * Contains the model weights received from clients for a given task and round.
 * Stored by task ID, round number and client ID.
 */
const weightsDict = {};
/**
 * Contains the number of data samples used for training by clients for a given
 * task and round. Stored by task ID, round number and client ID.
 */
const dataSamplesDict = {};
/**
 * Contains all successful requests made to the server. Stored by client ID,
 * task ID and round. An entry consists of:
 * - a timestamp corresponding to the time at which the request was made
 * - the request type (sending/receiving weights/metadata)
 */
const logs = {};
/**
 * List of clients (client IDs) currently connected to the the server.
 */
let clients = [];


/**
 * Verifies that the given POST request is correctly formatted. Its body must
 * contain:
 * - the client's ID
 * - a timestamp corresponding to the time at which the request was made
 * The client must already be connected to the specified task before making any
 * subsequent POST requests related to training.
 * @param {request} request received from client
 */
function isValidRequest(request) {
  const body = request.body;
  return body !== undefined &&
         body.id !== undefined && typeof body.id === 'string' &&
         clients.includes(body.id) &&
         body.timestamp !== undefined && typeof body.timestamp === 'string';
}

/**
 * Appends the given POST request's timestamp and type to the logs.
 * @param {request} request received from client
 * @param {type} type of the request (send/receive weights/metadata)
 */
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

/**
 * Request handler called when a client sends a GET request asking for the
 * activity history of the server (i.e. the logs). The client is allowed to be
 * more specific by providing a client ID, task ID or round number. Each
 * parameter is optional, but the client ID must precede the task ID, and the
 * task ID must precede the round number. A typical example of a client request
 * would consist in asking for the activity history of other clients on the
 * same task. It requires no prior connection to the server and is thus
 * publicly available data.
 * @param {request} request received from client
 * @param {response} response sent to client
 */
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

/**
 * Entry point to the server's API. Any client must go through this connection
 * process before making any subsequent POST requests to the server related to
 * the training of a task or metadata.
 * @param {request} request received from client
 * @param {response} response sent to client
 *
 * Further improvement: Clients connect to the server for a given task. This
 * would allow the server to perform checks early on (e.g. within this function)
 * and avoid weird error cases, such as a client connecting to a task not in
 * tasks.json nor/or without any TFJS model. Currently, such a client would be
 * allowed to send/receive weights/metadata although not linked to any official
 * task. This is linked to the getAllTasksData() and getInitialTaskModel()
 * functions.
 */
function connectToServer(request, response) {
    const id = request.params.id;
    if (clients.includes(id)) {
      response.status(400).send('Already connected to the server.');
    }
    clients.push(id);
    console.log(`Client with ID ${id} connected to the server`);
    response.status(200).send('Successfully connected to the server.');
}

/**
 * Request handler called when a client sends a GET request notifying the server
 * it is disconnecting from a given task.
 * @param {request} request received from client
 * @param {response} response sent to client
 *
 * Further improvement: Automatically disconnect idle clients, i.e. clients
 * with very poor and/or sparse contribution to training in terms of performance
 * and/or weights posting frequency.
 */
function disconnectFromServer(request, response) {
  const id = request.params.id;
  if (!clients.includes(id)) {
    response.status(400).send(
      'Not connected to the server. You must first connect in order to disconnect.'
    );
  }
  clients = clients.filter(clientId => (clientId != id));
  console.log(`Client with ID ${id} disconnected from the server`);
  response.status(200).send('Successfully disconnected from the server.');
}

/**
 * Request handler called when a client sends a POST request containing their
 * individual model weights to the server while training a task. The request is
 * made for a given task and round. The request's body must contain:
 * - the client's ID
 * - a timestamp corresponding to the time at which the request was made
 * - the client's weights
 * @param {request} request received from client
 * @param {response} response sent to client
 */
function sendIndividualWeights(request, response) {
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
  response.status(200).send('Weights successfully received.');

  logsAppend(request, requestType);
  return;
}

/**
 * Request handler called when a client sends a POST request asking for
 * the averaged model weights stored on server while training a task. The
 * request is made for a given task and round. The request succeeds once
 * CLIENTS_THRESHOLD % of clients sent their individual weights to the server
 * for the given task and round. Every MODEL_SAVE_TIMESTEP rounds into the task,
 * the requested averaged weights are saved under a JSON file at milestones/.
 * The request's body must contain:
 * - the client's ID
 * - a timestamp corresponding to the time at which the request was made
 * @param {request} request received from client
 * @param {response} response sent to client
 */
async function receiveAveragedWeights(request, response) {
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
  if (Object.keys(receivedWeights).length < Math.ceil(clients.length * CLIENTS_THRESHOLD)) {
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

/**
 * Request handler called when a client sends a POST request containing their
 * number of data samples to the server while training a task's model. The
 * request is made for a given task and round. The request's body must contain:
 * - the client's ID
 * - a timestamp corresponding to the time at which the request was made
 * - the client's number of data samples
 * @param {request} request received from client
 * @param {response} response sent to client
 *
 */
function sendDataSamplesNumber(request, response) {
  const requestType = 'SEND_nbsamples';

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

  if (!(task in dataSamplesDict)) {
    dataSamplesDict[task] = {};
  }
  if (!(round in dataSamplesDict)) {
    dataSamplesDict[task][round] = {};
  }
  dataSamplesDict[task][round][id] = samples;
  response.status(200).send('Number of samples successfully received.');

  logsAppend(request, requestType);
  return;
}

/**
 * Request handler called when a client sends a POST request asking the server
 * for the number of data samples held per client for a given task and round.
 * If there is no entry for the given round, sends the most recent entry for
 * each client involved in the task. The request's body must contain:
 * - the client's ID
 * - a timestamp corresponding to the time at which the request was made
 * @param {request} request received from client
 * @param {response} response sent to client
 */
function receiveDataSamplesNumbersPerClient(request, response) {
  const requestType = 'RECEIVE_nbsamples';

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

  if (!(task in dataSamplesDict && round >= 0)) {
    response.status(404).send(INVALID_REQUEST_KEYS_MESSAGE);
    console.log(`${requestType} failed`);
    return;
  }

  const latestDataSamplesDict = {};
  // For each round...
  for (let data of Object.values(dataSamplesDict[task])) {
    // ... fetch the latest entry
    for (let [id, samples] of Object.entries(data)) {
      latestDataSamplesDict[id] = samples;
    }
  }

  response.status(200).send(latestDataSamplesDict);

  logsAppend(request, requestType);
  return;
}

/**
 * Request handler called when a client sends a GET request asking for all the
 * tasks metadata stored in the server's tasks.json file. This is used for
 * generating the client's list of tasks. It requires no prior connection to the
 * server and is thus publicly available data.
 * @param {request} request received from client
 * @param {response} response sent to client
 */
function getAllTasksData(request, response) {
  const tasksFilePath = path.join(__dirname, TASKS_FILE);
  if (fs.existsSync(tasksFilePath)) {
    console.log(`Serving ${tasksFilePath}`);
    response.status(200).sendFile(tasksFilePath);
  } else {
    response.status(400).send({});
  }
}

/**
 * Request handler called when a client sends a GET request asking for the
 * TFJS model files of a given task. The files consist of the model's
 * architecture file model.json and its initial layer weights file weights.bin.
 * It requires no prior connection to the server and is thus publicly available
 * data.
 * @param {request} request received from client
 * @param {response} response sent to client
 */
function getInitialTaskModel(request, response) {
  const id = request.params.id;
  const file = request.params.file;
  const modelFiles = ['model.json', 'weights.bin'];
  const modelFilePath = path.join(__dirname, id, file);
  console.log(`File path: ${modelFilePath}`)
  if (modelFiles.includes(file) && fs.existsSync(modelFilePath)) {
    console.log(`${file} download for task ${id} succeeded`)
    response.status(200).sendFile(modelFilePath);
  } else {
    response.status(400).send({});
  }
}


// Asynchronously create and save Tensorflow models to local storage
Promise.all(models.map((createModel) => createModel()));

// Configure server routing
const tasksRouter = express.Router();

tasksRouter.get('/', getAllTasksData);
tasksRouter.get('/:id/:file', getInitialTaskModel);

app.use('/tasks', tasksRouter);

app.get('/connect/:task/:id', connectToServer);
app.get('/disconnect/:task/:id', disconnectFromServer);

app.post('/send_weights/:task/:round', sendIndividualWeights);
app.post('/receive_weights/:task/:round', receiveAveragedWeights);

app.post('/send_nbsamples/:task/:round', sendDataSamplesNumber);
app.post('/receive_nbsamples/:task/:round', receiveDataSamplesNumbersPerClient);

app.get('/logs/:id?/:task?/:round?', queryLogs);

app.get('/', (req, res) => res.send('FeAI Server'));

module.exports = app;
