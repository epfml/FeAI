/* eslint-disable no-case-declarations */
//import * as tf from '@tensorflow/tfjs';
import * as msgpack from 'msgpack-lite';
//import * as Peer from 'peerjs'
var Peer = require('peerjs');
var Hashes = require('jshashes');
import * as tf from '@tensorflow/tfjs';
import {
  storeModel,
  getSerializedModel,
  storeSerializedModel,
} from '../my_memory_script/indexedDB_script';
import {store} from '../../store/store'
/**
 * This object contains codes to identify what the incoming data
 * should be used for, e.g. to build the model, average the weights etc...
 */
// trying to reproduce an Enum

export const CMD_CODES = {
  ASSIGN_WEIGHTS: 0, // inject weights into model (unused)
  TRAIN_INFO: 1, // n. epochs, etc...
  MODEL_INFO: 2, // serialized model architecture + initial weights
  COMPILE_MODEL: 3, // args to model.compile, e.g. optimizer, metrics
  AVG_WEIGHTS: 4, // weights to average into model
  WEIGHT_REQUEST: 5, // ask for weights
};
Object.freeze(CMD_CODES); // make object immutable*/

/**
 * NOTE: peer.js seems to convert all array types to ArrayBuffer, making the original
 * type unrecoverable (Float32Array, Uint8Array, ...). The solution is to encode any payload
 * with msgpack.encode, then decode at the destination.
 */

/**
 * Wrapper class that deals with PeerJS communication.
 */
export class PeerJS {
  /**
   *
   * @param {function} handleData function to be called on incoming data. It should take the
   * incoming data as first argument.
   * @param  {...any} handleDataArgs args to handleData
   */
  constructor(id, password, handleData, ...handleDataArgs) {
    this.id = id
    this.data = null;
    this.handleData = handleData;
    this.handleDataArgs = handleDataArgs;
    this.password = password;
  }

  /**
   * Change data handling function
   */
  setDataHandler(func, ...args) {
    this.handleData = func;
    this.handleDataArgs = args;
  }
}

/**
 * Send data to a remote peer
 * @param {object} data data to send
 * @param {int} code code in CMD_CODES to identify what the data is for
 * @param {PeerJS} peerjs PeerJS object
 * @param {String} receiver name of receiver peer (must be registered in PeerJS server)
 */
export async function sendData(data, epoch, modelId) {
  const serverUrl = process.env.VUE_APP_SERVER_URI
  const url = serverUrl.concat('send_weights/').concat(modelId).concat('/').concat(epoch)
  const response = await fetch(url, {
    method: 'POST', 
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data) // body data type must match "Content-Type" header
  });
}

/**
 * Deserialize a received model
 * @param {object} modelData serialized model
 */
export async function loadModel(modelData) {
  var name = modelData.modelInfo.modelPath;
  console.log(modelData);
  await storeSerializedModel(modelData.modelInfo, modelData.modelData);
  const model = await tf.loadLayersModel('indexeddb://'.concat(name));

  return model;
}

function authenticate(data, senderId, password) {
  if (password) {
    if (!('password_hash' in data)) {
      console.log('Rejected message due to missing password hash');
      return false;
    }
    var SHA256 = new Hashes.SHA256();
    if (SHA256.hex(senderId + ' ' + password) !== data.password_hash) {
      console.log('Rejected message due to incorrect password hash');
      return false;
    }
  }
  return true;
}

/**
 * Function given to PeerJS instance to handle incoming data
 * @param {object} data incoming data
 * @param {object} buffer buffer to store data
 */
export async function handleData(data, senderId, password, buffer) {
  console.log('Received new data: ', data);

  if (!authenticate(data, senderId, password)) {
    return;
  }

  // convert the peerjs ArrayBuffer back into Uint8Array
  var payload = msgpack.decode(new Uint8Array(data.payload));
  switch (data.cmdCode) {
    case CMD_CODES.MODEL_INFO:
      buffer.model = payload;
      break;
    case CMD_CODES.ASSIGN_WEIGHTS:
      buffer.assignWeights = payload;
      break;
    case CMD_CODES.COMPILE_MODEL:
      buffer.compileData = payload;
      break;
    case CMD_CODES.AVG_WEIGHTS:
      console.log(payload);
      if (buffer.avgWeights === undefined) {
        buffer.avgWeights = {};
      }

      const epoch = payload.epoch;
      const weights = payload.weights;

      if (buffer.avgWeights[epoch] === undefined) {
        buffer.avgWeights[epoch] = [weights];
      } else {
        buffer.avgWeights[epoch].push(weights);
      }
      console.log('#Weights: ', buffer.avgWeights[epoch].length);
      break;
    case CMD_CODES.TRAIN_INFO:
      buffer.trainInfo = payload;
      break;
    case CMD_CODES.WEIGHT_REQUEST:
      if (buffer.weightRequests === undefined) {
        buffer.weightRequests = new Set([]);
      }
      buffer.weightRequests.add(payload.name); // peer name
      console.log('Weight request from: ', payload.name);

      break;
  }
}

/**
 * Handle data exchange after training is finished
 */
export async function handleDataEnd(data, senderId, password, buffer) {
  console.log('Received new data: ', data);
  console.log('handleDataEnd');

  if (!authenticate(data, senderId, password)) {
    return;
  }

  // convert the peerjs ArrayBuffer back into Uint8Array
  var payload = msgpack.decode(new Uint8Array(data.payload));
  console.log(payload);
  switch (data.cmdCode) {
    case CMD_CODES.WEIGHT_REQUEST:
      // eslint-disable-next-line no-case-declarations
      const receiver = payload.name;
      const epochWeights = {
        epoch: buffer.lastUpdate.epoch,
        weights: buffer.lastUpdate.weights,
      };
      console.log('Sending weights to: ', receiver);
      await sendData(
        epochWeights,
        CMD_CODES.AVG_WEIGHTS,
        buffer.peerjs,
        receiver
      );
      break;
  }
}
