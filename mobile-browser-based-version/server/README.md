## FeAI Helper Server

Centralized helper server for FeAI clients, running as an ExpressJS app. The server requires [Node](https://nodejs.org/en/), [Express](https://expressjs.com/), [PeerServer](https://github.com/peers/peerjs-server) and [Tensorflow](https://www.tensorflow.org/js). All library requirements are included in the `package.json` file.

### Components

#### Server

The server keeps track of connected peers and weights from each peer and communication round. It provides the following endpoints:

- `/connect/:task/:id` - connect peer with id `id` to task `task`.
- `/send_weights/:task/:round` - send individual weights for communication round `round` and task `task`. The request body should be a json with two fields: `id` and `weights`.
- `/get_weights/:task/:round` - get averaged weights for communication round `round` and task `task`.

#### Tasks

The training tasks given to DeAI clients are centralized on this server. Their descriptions as well as their deep learning model architectures must be made available to all peers, which is achieved via the following routing paths:

- `/tasks`: JSON file containing meta-data (including task id) on all available DeAI training tasks
- `/tasks/task_id/{model.json, weights.bin}`: Tensorflow neural network model files for the given task id (model architecture & initialization weights)

Tasks are stored in `tasks.json`. The models are declared in `models.js`.

#### Creating a new task

Adding a new task server-side can easily be done by following the next steps:

- add an entry to `tasks.json` with the task's parameters
- add a `createModel` function to `models.js` with the task's model architecture and export it

### Running the helper server

From this folder, you can run the server on localhost:8080 with the following command:

```
npm start
```
