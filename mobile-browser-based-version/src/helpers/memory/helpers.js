/**
 * Helper functions used to load and save TFJS models from IndexedDB. The
 * working model is the model currently being trained for a task. Saved models
 * are models that were explicitly saved to IndexedDB. The two working/ and saved/
 * folders are invisible to the user. The user only interacts with the saved/
 * folder via the model library. The working/ folder is only used by the backend.
 * The working model is loaded from IndexedDB for training (model.fit) only.
 */
import * as tf from '@tensorflow/tfjs';


const INDEXEDDB_SCHEME = 'indexeddb://';
const DOWNLOADS_SCHEME = 'downloads://';
const WORKING_MODEL = 'working';
const SAVED_MODEL = 'saved';


async function _getModelMetadata(taskId, modelName, modelType) {
  let key = INDEXEDDB_SCHEME.concat(`${modelType}/${taskId}/${modelName}`);
  return tf.io.listModels().then((models) =>
    key in models ? models[key] : false
  );
}

async function _getModel(taskId, modelName, modelType) {
  return tf.loadLayersModel(
    INDEXEDDB_SCHEME.concat(`${modelType}/${taskId}/${modelName}`)
  );
}

/**
 * Remove a previously saved model from IndexedDB.
 * @param {String} taskId the model's corresponding task
 * @param {String} modelName the model's file name
 */
async function _deleteModel(taskId, modelName, modelType) {
  await tf.io.removeModel(
    INDEXEDDB_SCHEME.concat(`${modelType}/${taskId}/${modelName}`)
  );
}

/**
 * Fetches metadata on the working model currently saved in IndexedDB.
 * Returns false if the specified model does not exist.
 * @param {String} taskId the working model's corresponding task
 * @param {String} modelName the working model's file name
 */
export async function getWorkingModelMetadata(taskId, modelName) {
  return _getModelMetadata(taskId, modelName, WORKING_MODEL);
}

/**
 * Fetches metadata on a model saved to IndexedDB. Returns false if the
 * specified model does not exist.
 * @param {String} taskId the model's corresponding task
 * @param {String} modelName the model's file name
 */
export async function getSavedModelMetadata(taskId, modelName) {
  return _getModelMetadata(taskId, modelName, SAVED_MODEL);
}

/**
 * Loads the working working model from IndexedDB and returns it as a fresh
 * TFJS object.
 * @param {String} taskId the working model's corresponding task
 * @param {String} modelName the working model's file name
 */
export async function getWorkingModel(taskId, modelName) {
  return _getModel(taskId, modelName, WORKING_MODEL);
}

/**
 * Loads a previously saved model from IndexedDB and returns it as a fresh
 * TFJS object.
 * @param {String} taskId the saved model's corresponding task
 * @param {String} modelName the saved model's file name
 */
export async function getSavedModel(taskId, modelName) {
  return _getModel(taskId, modelName, SAVED_MODEL);
}

/**
 * Loads a previously saved model into the current working model.
 * @param {String} taskId the saved model's corresponding task
 * @param {String} modelName the saved model's file name
 */
export async function loadSavedModel(taskId, modelName) {
  await tf.io.copyModel(
    INDEXEDDB_SCHEME.concat(`${SAVED_MODEL}/${taskId}/${modelName}`),
    INDEXEDDB_SCHEME.concat(`${WORKING_MODEL}/${taskId}/${modelName}`)
  );
}

/**
 * Loads a fresh model into the current working model.
 * @param {String} taskId the working model's corresponding task
 * @param {String} modelName the working model's file name
 * @param {Object} model the fresh model
 */
export async function updateWorkingModel(taskId, modelName, model) {
  await model.save(
    INDEXEDDB_SCHEME.concat(`${WORKING_MODEL}/${taskId}/${modelName}`)
  );
}

/**
 * Saves the current working model.
 * @param {String} taskId the working model's corresponding task
 * @param {String} modelName the working model's file name
 */
export async function saveWorkingModel(taskId, modelName) {
  await tf.io.copyModel(
    INDEXEDDB_SCHEME.concat(`working/${taskId}/${modelName}`),
    INDEXEDDB_SCHEME.concat(`saved/${taskId}/${modelName}`)
  );
}

export async function deleteWorkingModel(taskId, modelName) {
  await _deleteModel(taskId, modelName, WORKING_MODEL);
}

export async function deleteSavedModel(taskId, modelName) {
  await _deleteModel(taskId, modelName, SAVED_MODEL);
}

/**
 * Downloads a previously saved model.
 * @param {String} taskId the saved model's corresponding task
 * @param {String} modelName the saved model's file name
 */
export async function downloadSavedModel(taskId, modelName) {
  await tf.io.copyModel(
    INDEXEDDB_SCHEME.concat(`saved/${taskId}/${modelName}`),
    DOWNLOADS_SCHEME.concat(`${taskId}_${modelName}`)
  );
}
