/**
 * Test the server functionalities locally, without the need to run any client.
 * Run with `node test.js`
 */
const { serializeWeights } = require('./tfjs_helpers.js')
const msgpack = require('msgpack-lite')
const fetch = require('node-fetch')
const tf = require('@tensorflow/tfjs')
require('@tensorflow/tfjs-node')


async function testServerRequests() {
  let server = 'http://localhost:8081'

  let id = '09az'
  let round = 1
  let task = 'titanic'
  let model = await tf.loadLayersModel(`${server}/tasks/${task}/model.json`)
  let weights = msgpack.encode(await serializeWeights(model.weights))
  let samples = 5000

  let headers = {
    'Content-Type': 'application/json'
  }

  // Connect to server
  let response = await fetch(`${server}/connect/${task}/${id}`)
  console.log(response)
  console.log(await response.text())

  // Send local weights
  response = await fetch(`${server}/send_weights/${task}/${round}`, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify({
      id: id,
      timestamp: new Date(),
      weights: weights
    })
  })
  console.log(response)
  console.log(await response.text())

  // Get averaged weights
  response = await fetch(`${server}/receive_weights/${task}/${round}`, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify({
      id: id,
      timestamp: new Date()
    })
  })
  console.log(response)
  console.log(await response.json())

  // Post number of samples
  for (let i = 0; i < 3; i++) {
    response = await fetch(`${server}/send_data_info/${task}/${round + i}`, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({
        id: id,
        timestamp: new Date(),
        samples: samples + i
      })
    })
    console.log(response)
    console.log(await response.text())
  }

  // Get number of samples per client
  response = await fetch(`${server}/receive_data_info/${task}/${round + 3}`, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify({
      id: id,
      timestamp: new Date()
    })
  })
  console.log(response)
  console.log(await response.json())

  // Get logs for own activity
  response = await fetch(`${server}/logs/${id}`)
  console.log(response)
  console.log(await response.json())

  response = await fetch(`${server}/logs/${id}/${task}`)
  console.log(response)
  console.log(await response.json())

  response = await fetch(`${server}/logs/${id}/${task}/${round}`)
  console.log(response)
  console.log(await response.json())

  // Disconnect from server
  response = await fetch(`${server}/disconnect/${task}/${id}`)
  console.log(response)
  console.log(await response.text())
}

testServerRequests()
