const express               = require('express');
const fs                    = require('fs');
const { models }            = require('./models.js');
const cors                  = require('cors');
const path                  = require('path');
const { averageWeights }    = require('./tfjs_helpers.js');
const { type } = require('os');
const msgpack = require("msgpack-lite");

// fraction of peers required to complete communication round
const PEERS_THRESHOLD = 0.8

const app = express();
app.enable('trust proxy');
app.use(cors());
app.use(express.json({limit: '50mb'}));
app.use(express.urlencoded({limit: '50mb', extended: false}));
const server = app.listen(8080);

const weights_dict = {}
let peers = []

function sendWeights(request, response) {
  const body = request.body
  const id = body.id
  const weights = msgpack.decode(Uint8Array.from(body.weights.data))
  const timestamp = body.timestamp
  const round = request.params['round']
  const task = request.params['task']
  if(!(task in weights_dict)){
    weights_dict[task] = {}
  }
  if(!(round in weights_dict[task])){
    weights_dict[task][round] = {}
  }
  weights_dict[task][round][id] = weights
  response.send('weights received')
}

async function getWeights(request, response) {
  const task = request.params['task']
  const round = request.params['round']
  if(!(task in weights_dict) || !(round in weights_dict[task])){
    response.send({})
    return
  }
  const receivedWeights = weights_dict[task][round]
  if(Object.keys(receivedWeights).length < peers.length*PEERS_THRESHOLD){
    response.send({})
    return
  }
  // TODO: use proper average of model weights (can be copied from the frontend)
  let serializedWeights = await averageWeights(Object.values(receivedWeights))
  console.log(serializedWeights)
  console.log(typeof serializedWeights)
  let weights = msgpack.encode(Array.from(serializedWeights))
  response.send({'weights': weights})
  return
}

Promise.all(models.map((createModel) => createModel()))

const tasksRouter = express.Router();
tasksRouter.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'tasks.json'));
});
tasksRouter.get('/:id/:file', (req, res) => {
  res.sendFile(path.join(__dirname, req.params['id'], req.params['file']))
});

app.get('/connect/:task/:id', (req, res) => {
  peers.push(req.params['id'])
  console.log('Peer connected: '.concat(req.params['id']))
  res.send('Successfully connected')
})
app.get('/disconnect/:task/:id', (req, res) => {
  peers = peers.filter(val => (val != req.params['id']));
  console.log('Peer disconnected: '.concat(req.params['id']))
  res.send('Successfully disconnected')
})
app.post('/send_weights/:task/:round', sendWeights);
app.get('/get_weights/:task/:round', getWeights)

app.get('/', (req, res) => res.send('FeAI Server'));
app.use('/tasks', tasksRouter);
module.exports = app;