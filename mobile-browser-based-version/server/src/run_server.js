import { models } from './tasks/models.js';
import * as requests from './request_handlers/requests.js';
import express from 'express';
import cors from 'cors';

const app = express();
app.enable('trust proxy');
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: false }));
app.listen(8081); // Different port from Vue client

// Asynchronously create and save Tensorflow models to local storage
Promise.all(models.map(createModel => createModel()));

// Configure server routing
const tasksRouter = express.Router();

tasksRouter.get('/', requests.getAllTasksData);
tasksRouter.get('/:task/:file', requests.getInitialTaskModel);

app.use('/tasks', tasksRouter);

app.get('/connect/:task/:id', requests.connectToServer);
app.get('/disconnect/:task/:id', requests.disconnectFromServer);

app.post('/send_weights/:task/:round', requests.sendIndividualWeights);
app.post('/receive_weights/:task/:round', requests.receiveAveragedWeights);

app.post('/send_nbsamples/:task/:round', requests.sendDataSamplesNumber);
app.post(
  '/receive_nbsamples/:task/:round',
  requests.receiveDataSamplesNumbersPerClient
);

app.get('/logs', requests.queryLogs);

app.get('/', (req, res) => res.send('FeAI Server'));

export default app;
