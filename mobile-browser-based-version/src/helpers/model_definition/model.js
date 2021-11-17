import * as tf from '@tensorflow/tfjs';
import { InteroperabilityLayer } from '../model_definition/custom_layers';
import { getWorkingModel, getWorkingModelMetadata } from '../memory/helpers';
import { CsvTask } from '../../task_definition/csv_task';

/**
 * Enumeration for the types of personalization.
 */
export const personalizationType = {
  NONE: 'NONE',
  INTEROPERABILITY: 'interoperability',
};

/**
 * TFJS Model wrapper to implement personalization locally. TODO: Add more description.
 */
export class Model {
  constructor(task, useIndexedDB) {
    this.task = task;
    this.dataType = task.trainingInformation.dataType;
    this.useIndexedDB = useIndexedDB;
  }

  /**
   * Creates the model.
   * If IndexedDB is turned on and the working model exists, then load the
   * existing model from IndexedDB. Otherwise, create a fresh new one.
   */
  async init() {
    let model;
    if (this.useIndexedDB) {
      let modelParams = [
        this.task.taskId,
        this.task.trainingInformation.modelId,
      ];
      let metadata = await getWorkingModelMetadata(...modelParams);

      if (metadata) {
        console.log('Loading from memory ');
        model = await getWorkingModel(...modelParams);
      } else {
        console.log('Creating New');
        model = await this.task.createModel();
      }
    } else {
      console.log('No indexDB');
      model = await this.task.createModel();
    }

    this.model = model;
    this.type =
      model.getUserDefinedMetadata()['personalizationType'] ??
      personalizationType.NONE;
  }

  /**
   *  Getter for the model.
   *  @returns the model we want to train.
   */
  getModel() {
    return this.model;
  }

  /**
   *  This is a getter for the part of the model we want to share with the network.
   *  For personalizationType.NONE this is simply the model.
   *  The behaviour depends on the personalization type of the model.
   *  @returns the part of the model we want to share.
   */
  getSharedModel() {
    switch (this.type) {
      case personalizationType.NONE:
        return this.model;

      case personalizationType.INTEROPERABILITY:
        return this.model.layers[1];
    }
  }

  /**
   *  Getter for the personalization type.
   *  @returns the personalization type of the model.
   */
  getPersonalizationType() {
    return this.type;
  }

  /**
   * This method updates the type of personalization of the model.
   *
   * @param {personalizationType} newType the new type
   * @returns the model with a new personalization type.
   */
  updatePersonalizationType(newType) {
    switch (newType) {
      case personalizationType.NONE:
        this.model = this.getSharedModel();
        this.model.setUserDefinedMetadata({ personalizationType: newType });
        this.type = newType;
        console.log('Updating model to type :' + newType);
        break;

      case personalizationType.INTEROPERABILITY:
        if (this.type != newType && this.dataType == 'csv') {
          this.model = this._createInteroperabilityModel(this.getSharedModel());
          this.model.setUserDefinedMetadata({ personalizationType: newType });
          this.type = newType;
          console.log('Updating model to type :' + newType);
        } else {
          console.log('Model already of type :' + newType);
        }
        break;
    }
  }

  /**
   * Private method that, given a model, creates an Interoperability Model by wrapping it in between two Interoperability Layers.
   * @param {Object} model the model we want to wrap
   * @returns the model wrapped in between two Interoperability Layers.
   */
  _createInteroperabilityModel(model) {
    let modelInputSize = model.layers[0].input.shape[1];
    let modelOutputSize = model.layers[model.layers.length - 1].outputShape[1];

    let personalModel = tf.sequential();

    personalModel.add(
      new InteroperabilityLayer({
        units: modelInputSize,
        inputShape: [modelInputSize],
      })
    );
    personalModel.add(model);
    personalModel.add(new InteroperabilityLayer({ units: modelOutputSize }));

    return personalModel;
  }

  /**
   *
   */
  getInteroperabilityParameters() {
    /*return {
      weightsIn: this.model.layers[0].weights[0].read().dataSync(),
      biasesIn: this.model.layers[0].weights[1].read().dataSync(),
    };*/
    return [
      this.model.layers[0].weights[0].read().dataSync(),
      this.model.layers[0].weights[1].read().dataSync(),
    ];
  }
}
