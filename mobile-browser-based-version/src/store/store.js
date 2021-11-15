import { createStore } from 'vuex';

export const store = createStore({
  state: {
    count: 0,
    globalTaskFrameState: new Array(),
    passwords: new Array(),
    tasks: new Array(),
    useIndexedDB: true,
    isDark: false,
    activePage: 'home',
  },
  mutations: {
    increment(state) {
      state.count++;
    },

    addGlobalTaskFrameState(state, newGlobalTaskFrameState) {
      let modelId = newGlobalTaskFrameState.modelId;
      state.globalTaskFrameState[modelId] = newGlobalTaskFrameState;
    },

    addPassword(state, payload) {
      state.passwords[payload.id] = payload.password;
    },

    addTask(state, payload) {
      state.tasks[payload.task.trainingInformation.modelId] = payload.task;
    },

    setIndexedDB(state, payload) {
      // Convert payload to boolean value
      state.useIndexedDB = payload ? true : false;
    },

    setAppTheme(state, payload) {
      state.isDark = payload ? true : false;
    },

    setActivePage(state, payload) {
      state.activePage = payload;
    },
  },

  getters: {
    globalTaskFrameState: state => modelId => {
      return state.globalTaskFrameState[modelId];
    },
    password: state => taskId => {
      return taskId in state.passwords ? state.passwords[taskId] : null;
    },
    tasks: state => modelId => {
      return state.tasks[modelId];
    },
  },
});

export default store;
