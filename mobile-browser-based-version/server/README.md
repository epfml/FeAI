## FeAI Helper Server

Centralized helper server for FeAI clients, running as an ExpressJS app. The server requires [Node](https://nodejs.org/en/), [Express](https://expressjs.com/), [PeerServer](https://github.com/peers/peerjs-server) and [Tensorflow](https://www.tensorflow.org/js). All library requirements are included in the `package.json` file.

### Components

#### Server

The server keeps track of connected peers and weights from each peer and communication round. It provides the following endpoints:

Simple GET requests.
- `/connect/<task>/<id>` - connects peer with ID `id` to task `task`.
- `/disconnect/<task>/<id>` - disconnects peer with ID `id` from task `task`.
- `/logs/<id>/<task>/<round>` - logs containing all training communication history made with the server (see POST requests below)

POST requests with required body `{ id, timestamp, [data]}`. Client ID and request timestamp are required for logging.
- `/send_weights/<task>/<round>` - peer sends individual weights `weights` from peer with ID `id` for communication round `round` and task `task`.
- `/receive_weights/<task>/<round>` - peer receives averaged weights for communication round `round` and task `task`.
- `/send_data_info/<task>/<round>` - peer sends individual number of samples `samples` for communication round `round` and task `task`.
- `/receive_data_info/<task>/<round>` - peer receives data shares percentages per client ID `id` for communication round `round` and task `task`.



#### Tasks

The training tasks given to FeAI clients are centralized on this server. Their descriptions as well as their deep learning model architectures must be made available to all peers, which is achieved via the following routing paths:

- `/tasks`: JSON file containing meta-data (including task id) on all available FeAI training tasks
- `/tasks/<task_id>/{model.json, weights.bin}`: Tensorflow neural network model files for the given task id (model architecture & initialization weights)

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

Google App Engine (GAE) creates an HTTPS certificate automatically, making this the easiest way to deploy the helper server in the Google Cloud Platform.

To change the GAE app configuration, you can modify the file `app.yaml`.

To deploy the app on GAE, you can run the following command, replacing PROJECT-ID with the your project ID:

```
gcloud app deploy --project=PROJECT-ID --promote --quiet app.yaml
```
