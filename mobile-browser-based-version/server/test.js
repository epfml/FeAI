/**
 * Test the server functionalities locally, without the need to run any client.
 * Run with `node test.js`
 */
const { serializeWeights } = require('./tfjs_helpers.js')
const msgpack = require('msgpack-lite')
const fetch = require('node-fetch')
const tf = require('@tensorflow/tfjs')
require('@tensorflow/tfjs-node')


/**
 * Naively tests all the API requests made available by the FeAI centralized
 * server from a single client's point of view.
 */
async function testServerRequests() {
  let server = 'http://localhost:8081'
  // Declare parameters for the requests below
  let id = '09az'
  let round = 1
  let task = 'titanic'
  let model = await tf.loadLayersModel(`${server}/tasks/${task}/model.json`)
  let weights = msgpack.encode(await serializeWeights(model.weights))
  let nbsamples = 5000
  let headers = {
    'Content-Type': 'application/json'
  }

  /**
   * Connect to server.
   */
  let response = await fetch(`${server}/connect/${task}/${id}`)
  console.log(response)
  console.log(await response.text())

  /**
   * Send local weights for round #1.
   */
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

  /**
   * Receive averaged weights for round #1.
   */
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

  /**
   * Send number of samples for rounds #{1, 2, 3}.
   */
  for (let i = 0; i < 3; i++) {
    response = await fetch(`${server}/send_nbsamples/${task}/${round + i}`, {
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

  /**
   * Receive number of samples per client for round #4. Expects metadata from the
   * latest round with information, i.e. round #3.
   */
  response = await fetch(`${server}/receive_nbsamples/${task}/${round + 3}`, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify({
      id: id,
      timestamp: new Date()
    })
  })
  console.log(response)
  console.log(await response.json())

  /**
   * Get server logs for own activity. Expects the list of all previous POST
   * requests.
   */
  response = await fetch(`${server}/logs/${id}`)
  console.log(response)
  console.log(await response.json())

  response = await fetch(`${server}/logs/${id}/${task}`)
  console.log(response)
  console.log(await response.json())

  response = await fetch(`${server}/logs/${id}/${task}/${round}`)
  console.log(response)
  console.log(await response.json())

  /**
   * Disconnect from server
   */
  response = await fetch(`${server}/disconnect/${task}/${id}`)
  console.log(response)
  console.log(await response.text())
}

testServerRequests()
