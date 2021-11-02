import * as tf from '@tensorflow/tfjs';
import { model } from '@tensorflow/tfjs';
import { handleData } from '../communication_script/peer';
import { storeModel } from '../my_memory_script/indexedDB_script';
import { InteroperabilityLayer } from './custom_layers';

/**
 * Trains the model given as argument
 * @param {TFJS Model} model the model used for training
 * @param {Tensor} trainData the tensor holding the training data
 * @param {1D-Tensor} labels the tensor holding the labels
 * @param {Number} batchSize the batch size used for training
 * @param {Number} validationSplit the size of the validation set
 * @param {Number} epochs the number of epochs used for training
 * @param {function} updateUI a function called to update the UI to give feedbacks on the training
 */
export async function training(
  modelId,
  trainData,
  labels,
  batchSize,
  validationSplit,
  epochs,
  trainingInformant,
  modelCompileData,
  learningRate = null
) {
  console.log('Start Training');

  const savedModelPath = 'indexeddb://working_'.concat(modelId);
  var model = await tf.loadLayersModel(savedModelPath);

  model.summary();
  model.compile(modelCompileData);

  if (learningRate != null) {
    model.optimizer.learningRate = learningRate;
  }

  await model
    .fit(trainData, labels, {
      batchSize: batchSize,
      epochs: epochs,
      validationSplit: validationSplit,
      shuffle: true,
      callbacks: {
        onEpochEnd: async (epoch, logs) => {
          trainingInformant.updateCharts(
            epoch + 1,
            (logs['val_acc'] * 100).toFixed(2),
            (logs['acc'] * 100).toFixed(2)
          );
          console.log(`EPOCH (${epoch + 1}): Train Accuracy: ${(
            logs['acc'] * 100
          ).toFixed(2)},
             Val Accuracy:  ${(logs['val_acc'] * 100).toFixed(2)}\n`);
          console.log(`loss ${logs.loss.toFixed(4)}`);
          //await tf.nextFrame();
        },
      },
    })
    .then(async info => {
      await model.save(savedModelPath);
      console.log('Training finished', info.history);
    });
}

/**
 * 
 * @param {TFJS} model the TFJS model used for training
 * @param {Tensor} trainData the training data
 * @param {Tensor} labels the labels of the data
 * @param {Number} batchSize the batchsize used for training
 * @param {Number} validationSplit the validation split used for trainig
 * @param {Object} modelCompileData compiling data (optimizer, lost, metric ...)
 * @param {Object} modelTrainData compiling data (containing number of epoch)
 * @param {*} onEpochBegin function called at the start of each epoch
 * @param {*} onEpochEnd function called at the end of each epoch
 * @param {PeerJS} peerjs peerJS object

 */
export async function trainingDistributed(
  modelId,
  trainData,
  labels,
  epochs,
  batchSize,
  validationSplit,
  modelCompileData,
  trainingManager,
  peerjs,
  recvBuffer,
  learningRate = null
) {
  // shuffle to avoid having the same thing on all peers
  //var indices = tf.linspace(0, trainData.shape[0]).cast('int32')
  //tf.util.shuffle(indices)
  //const xTrain1d = trainData.gather(indices)
  //const yTrain1d = labels.gather(indices)

  const savedModelPath = 'indexeddb://working_'.concat(modelId);
  var model = await tf.loadLayersModel(savedModelPath);

  peerjs.setDataHandler(handleData, recvBuffer);
  model.summary();
  // compile the model
  model.compile(modelCompileData);

  if (learningRate != null) {
    model.optimizer.learningRate = learningRate;
  }
  // start training
  console.log('Training started');
  await model
    .fit(trainData, labels, {
      epochs: epochs,
      batchSize: batchSize,
      validationSplit: validationSplit,
      shuffle: true,
      callbacks: {
        onEpochBegin: trainingManager.onEpochBegin(),
        onEpochEnd: async (epoch, logs) => {
          await trainingManager.onEpochEnd(
            model,
            epoch + 1,
            (logs.acc * 100).toFixed(2),
            (logs.val_acc * 100).toFixed(2),
            modelId
          );
          console.log(`EPOCH (${epoch + 1}): Train Accuracy: ${(
            logs.acc * 100
          ).toFixed(2)},
             Val Accuracy:  ${(logs.val_acc * 100).toFixed(2)}\n`);
          //await tf.nextFrame();
        },
      },
    })
    .then(async info => {
      await model.save(savedModelPath);
      console.log('Training finished', info.history);
    });
}

/**
 * This function is called when we decided to train using personalized. It creates a local and a global model.
 * 
 * @param {TFJS} model the TFJS model used for training
 * @param {Tensor} trainData the training data
 * @param {Tensor} labels the labels of the data
 * @param {Number} batchSize the batchsize used for training
 * @param {Number} validationSplit the validation split used for trainig
 * @param {Object} modelCompileData compiling data (optimizer, lost, metric ...)
 * @param {Object} modelTrainData compiling data (containing number of epoch)
 * @param {*} onEpochBegin function called at the start of each epoch
 * @param {*} onEpochEnd function called at the end of each epoch
 * @param {PeerJS} peerjs peerJS object

 */
export async function trainingDistributedInteroperability(
  modelId,
  trainData,
  labels,
  epochs,
  batchSize,
  validationSplit,
  modelCompileData,
  trainingManager,
  peerjs,
  recvBuffer,
  learningRate = null
) {
  // shuffle to avoid having the same thing on all peers
  //var indices = tf.linspace(0, trainData.shape[0]).cast('int32')
  //tf.util.shuffle(indices)
  //const xTrain1d = trainData.gather(indices)
  //const yTrain1d = labels.gather(indices)

  const savedModelPath = 'indexeddb://working_'.concat(modelId);
  var model = await tf.loadLayersModel(savedModelPath);
  peerjs.setDataHandler(handleData, recvBuffer);
  console.log('Training Distributed with Interoperability');

  // Let's try to see what's displayed

  let modelInputSize = model.layers[0].input.shape[1];
  let modelOutputSize = model.layers[model.layers.length - 1].outputShape[1];
  // We create our local model as a wrapper of the input model
  let localModel;

  try {
    console.log('Loading Local Model from storage');
    localModel = await tf.loadLayersModel(savedModelPath.concat('_local'));
    model = localModel.layers[1];
  } catch (e) {
    // For now the only personalization is iFedAvg. More personalization options coming soon.
    console.log('The local model is not defined, creating a new one ' + e);
    localModel = tf.sequential();

    localModel.add(
      new InteroperabilityLayer({
        units: modelInputSize,
        inputShape: [modelInputSize],
      })
    );
    localModel.add(model);
    localModel.add(new InteroperabilityLayer({ units: modelOutputSize }));
  }

  localModel.summary();

  // compile the model
  localModel.compile(modelCompileData);

  if (learningRate != null) {
    localModel.optimizer.learningRate = learningRate;
  }
  // start training
  // We train the wrappedModel, but we communicate the inner model
  console.log('Training started');
  await localModel
    .fit(trainData, labels, {
      epochs: epochs,
      batchSize: batchSize,
      validationSplit: validationSplit,
      shuffle: true,
      callbacks: {
        onEpochBegin: trainingManager.onEpochBegin(),
        onEpochEnd: async (epoch, logs) => {
          await trainingManager.onEpochEnd(
            model,
            epoch + 1,
            (logs.acc * 100).toFixed(2),
            (logs.val_acc * 100).toFixed(2),
            modelId
          );
          console.log(`EPOCH (${epoch + 1}): Train Accuracy: ${(
            logs.acc * 100
          ).toFixed(2)},
             Val Accuracy:  ${(logs.val_acc * 100).toFixed(2)}\n`);
          //await tf.nextFrame();
        },
      },
    })
    .then(async info => {
      await model.save(savedModelPath);
      await localModel.save(savedModelPath.concat('_local'));
      console.log('Training finished', info.history);
    });

  // Now we wanna display the weights here
  console.log('Cusom');
  console.log(
    localModel.layers[0].name + ' weight',
    localModel.layers[0].weights[0].read().dataSync()
  );
  console.log(
    localModel.layers[0].name + ' bias',
    localModel.layers[0].weights[1].read().dataSync()
  );
}
