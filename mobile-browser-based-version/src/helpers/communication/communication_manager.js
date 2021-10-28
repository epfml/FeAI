import * as msgpack from 'msgpack-lite';
import * as tf from '@tensorflow/tfjs';
import { makeid, serializeWeights, assignWeightsToModel } from './helpers';
import { store } from '../../store/store';

// In milliseconds
const TIME_PER_TRIES = 100;
// Corresponds to waiting 10 seconds (since each try is performed every 100ms)
const MAX_TRIES = 100;

/**
 * Class that deals with communication with the server.
 */
export class CommunicationManager {
  /**
   * Prepares connection to a centralized server.
   * @param {Number} portNbr the port number to connect.
   * @param {String} password
   */
  constructor(portNbr, password = null) {
    this.portNbr = portNbr;
    this.clientId = null;
    this.isConnected = false;
    this.password = password;
  }

  /**
   * Disconnection process when user quits the task.
   */
  disconnect(environment) {
    const serverUrl = process.env.VUE_APP_SERVER_URI;
    const url = serverUrl.concat(
      'disconnect/',
      environment.Task.taskId,
      '/',
      this.clientId
    );
    fetch(url, {
      method: 'GET',
      keepalive: true,
    });
  }

  /**
   * Initialize the connection to the server.
   */
  async connect(environment) {
    // Create an ID used to connect to the server
    this.clientId = await makeid(10);
    const serverUrl = process.env.VUE_APP_SERVER_URI;
    const url = serverUrl.concat(
      'connect/',
      environment.Task.taskId,
      '/',
      this.clientId
    );
    const response = await fetch(url, { method: 'GET' });

    if (response.ok) {
      environment.$toast.success(
        'Succesfully connected to server. Distributed training available.'
      );
    } else {
      console.log('Error in connecting');
      environment.$toast.error(
        'Failed to connect to server. Fallback to training alone.'
      );
    }
    setTimeout(environment.$toast.clear, 30000);
  }

  receiveWeightsBreak(taskId, epoch) {
    const communicationManager = this;
    return new Promise(resolve => {
      (async function waitData(n) {
        const serverUrl = process.env.VUE_APP_SERVER_URI;
        const url = serverUrl.concat('receive_weights/', taskId, '/', epoch);
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            id: communicationManager.clientId,
            timestamp: new Date(),
          }),
        });
        if (response.ok) {
          const data = await response.json();
          return resolve(msgpack.decode(Uint8Array.from(data.weights.data)));
        }
        if (n >= MAX_TRIES - 1) {
          console.log(
            'No weights received from server. Continuing with local weights.'
          );
          return resolve(Uint8Array.from([]));
        }
        setTimeout(() => waitData(n + 1), TIME_PER_TRIES);
      })(0);
    });
  }

  async sendWeights(weights, taskId, epoch) {
    const serverUrl = process.env.VUE_APP_SERVER_URI;
    const url = serverUrl.concat('send_weights/', taskId, '/', epoch);
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: this.clientId,
        timestamp: new Date(),
        weights: weights,
      }),
    });
    return response.ok;
  }

  async onEpochEndCommunication(model, taskId, epoch, trainingInformant) {
    // Send local weights to server
    const serializedWeights = await serializeWeights(model);
    trainingInformant.addMessage('Sending weights to server');
    await this.sendWeights(
      msgpack.encode(Array.from(serializedWeights)),
      taskId,
      epoch
    );

    // Receive averaged weights from server
    trainingInformant.addMessage('Waiting to receive weights');
    var startTime = new Date();
    await this.receiveWeightsBreak(taskId, epoch).then(weights => {
      var endTime = new Date();
      var timeDiff = endTime - startTime; // in ms
      timeDiff /= 1000;
      trainingInformant.updateWaitingTime(Math.round(timeDiff));
      trainingInformant.updateNbrUpdatesWithOthers(1);
      trainingInformant.addMessage('Updating local weights');

      let newWeights = weights.length == 0 ? serializedWeights : weights;

      assignWeightsToModel(newWeights, model);
    });
  }
}
