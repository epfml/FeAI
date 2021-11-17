import * as tf from '@tensorflow/tfjs';
import { personalizationType } from '../helpers/model_definition/model';
export class Task {
  constructor(taskId, displayInformation, trainingInformation) {
    this.taskId = taskId;
    this.displayInformation = displayInformation;
    this.trainingInformation = trainingInformation;
  }

  async createModel() {
    let serverUrl = process.env.VUE_APP_SERVER_URI;
    let newModel = await tf.loadLayersModel(
      serverUrl.concat('tasks/', this.taskId, '/model.json')
    );
    newModel.setUserDefinedMetadata({
      personalizationType: personalizationType.NONE,
    });
    return newModel;
  }

  // should not be here
  async getModelFromStorage() {
    let savePath = `indexeddb://saved_${this.trainingInformation.modelId}`;
    let model = await tf.loadLayersModel(savePath);
    return model;
  }
}
