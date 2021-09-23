const express               = require('express');
const fs                    = require('fs');
const { models }            = require('./models.js');
const cors                  = require('cors');
const path = require('path');

const app = express();
app.enable('trust proxy');
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({extended: false}));
const server = app.listen(8080);
const average = arr => arr.reduce((a,b) => a + b, 0) / arr.length;

const weights_dict = {}
const peers = []

function sendWeights(request, response) {
  const body = request.body
  const id = body.id
  const weights = body.weights
  const epoch = request.params['epoch']
  const task = request.params['task']
  if(!(task in weights_dict)){
    weights_dict[task] = {}
  }
  if(!(epoch in weights_dict[task])){
    weights_dict[task][epoch] = {}
  }
  weights_dict[task][epoch][id] = weights
  console.log(weights_dict)
  response.send('weights received')
}

function getWeights(request, response) {
  const task = request.params['task']
  const epoch = request.params['epoch']
  if(!(task in weights_dict) || !(epoch in weights_dict[task])){
    return {}
  }
  const receivedWeights = weights_dict[task][epoch]
  if(Object.keys(receivedWeights).length != peers.length){
    return {}
  }
  // TODO: use proper average of model weights (can be copied from the frontend)
  response.send({'weights': average(Object.values(receivedWeights))})
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
  console.log(peers)
  res.send('Successfully connected')
})
app.post('/send_weights/:task/:epoch', sendWeights);
app.get('/get_weights/:task/:epoch', getWeights)

app.get('/', (req, res) => res.send('FeAI Server'));
app.use('/tasks', tasksRouter);
module.exports = app;