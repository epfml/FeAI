import { makeid } from './helpers';
import Peer from 'peerjs';
import { PeerJS, handleData } from './peer';
import {store} from '../../store/store'
/**
 * Class that deals with communication with the PeerJS server.
 * Collects the list of receivers currently connected to the PeerJS server.
 */
export class CommunicationManager {
  /**
   * Prepares connection to a PeerJS server.
   * @param {Number} portNbr the port number to connect.
   */
  constructor(portNbr, password = null) {
    this.portNbr = portNbr;
    this.peerjsId = null;
    this.peer = null;
    this.peerjs = null;
    this.receivers = [];
    this.isConnected = null;
    this.recvBuffer = null;
    this.password = password;
  }

  /**
   * Disconnection process when user quits the task.
   */

  disconnect(environment) {
    const serverUrl = process.env.VUE_APP_SERVER_URI
    const url = serverUrl.concat('disconnect/').concat(environment.Task.trainingInformation.modelId).concat('/').concat(this.peerjsId)
    fetch(url, {
      method: 'GET', 
      keepalive: true,
    });
  }

  /**
   * Initialize the connection to the server.
   * @param {Number} epochs the number of epochs (required to initialize the communication buffer).
   */
  async initializeConnection(epochs, environment) {
    // initialize the buffer
    this.recvBuffer = {
      trainInfo: {
        epochs: epochs,
      },
    };

    // create an ID used to connect to the server
    this.peerjsId = await makeid(10);
    const serverUrl = process.env.VUE_APP_SERVER_URI
    const url = serverUrl.concat('connect/').concat(environment.Task.trainingInformation.modelId).concat('/').concat(this.peerjsId)
    const response = await fetch(url, {
      method: 'GET', 
    });

    let responseText = await response.text();

    if (responseText == 'Successfully connected'){
      this.isConnected = true;
      this.peerjs = await new PeerJS(
        this.peerjsId,
        this.password,
        handleData,
        this.recvBuffer
      );

      environment.$toast.success(
        'Succesfully connected to server. Distributed training available.'
      );
      setTimeout(environment.$toast.clear, 30000);
    }
    else {
      console.log('Error in connecting');
      this.isConnected = false;

      environment.$toast.error(
        'Failed to connect to server. Fallback to training alone.'
      );
      setTimeout(environment.$toast.clear, 30000);
    }
  }
}
