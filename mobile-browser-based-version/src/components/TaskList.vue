<template>
  <baseLayout v-bind:withSection='true'>
    <!-- Main Page Content -->
        <div
          v-for="task in tasks"
          :key="task.taskId"
          class="grid grid-cols-1 gap-8 p-4 lg:grid-cols-1 xl:grid-cols-1"
        >
          <card>
            <div>
              <h6
                class="text-xl font-medium leading-none tracking-wider dark:group-hover:text-darker"
              >
                {{ task.displayInformation.taskTitle }}
              </h6>
            </div>
            <div class="ml-10">
              <ul class="text-base ont-semibold text-gray-500 dark:text-light">
                <span v-html="task.displayInformation.summary"></span>
              </ul>
            </div>
            <div class="py-2">
              <span>
                <customButton
                  v-on:click="goToSelection(task.taskId)"
                >
                  Join
                </customButton>
              </span>
            </div>
          </card>
        </div>
  </baseLayout>
</template>

<script>
// Task's main frames
import MainTaskFrame from "../components/main_frames/MainTaskFrame";
import MainDescriptionFrame from "../components/main_frames/MainDescriptionFrame";
import MainTrainingFrame from "../components/main_frames/MainTrainingFrame";
import MainTestingFrame from "../components/main_frames/MainTestingFrame";

// WARNING: temporay code until serialization of Task object
// Import the tasks objects Here
import { CsvTask } from "../task_definition/csv_task";
import { ImageTask } from "../task_definition/image_task";
import baseLayout from "./containers/BaseLayout";
import card from "./containers/Card";
import customButton from "./simple/CustomButton";
import { defineComponent } from "vue";

export default {
  name: "TaskList",
  components: { baseLayout, card, customButton },
  data() {
    return {
      tasks: [],
      tasksUrl: process.env.VUE_APP_SERVER_URI.concat('tasks'),
    };
  },
  methods: {
    goToSelection(id) {
      this.$router.push({
        name: id.concat(".description"),
        params: { Id: id },
      });
    },
  },
  async mounted() {
    let tasks = await fetch(this.tasksUrl)
      .then((response) => response.json())
      .then((tasks) => {
        for (let task of tasks) {
          console.log(`Processing ${task.taskId}`);
          let newTask;
          // TODO: avoid this switch by having one Task class completely determined by a json config
          switch (task.trainingInformation.dataType) {
            case "csv":
              newTask = new CsvTask(
                task.taskId,
                task.displayInformation,
                task.trainingInformation
              );
              break;
            case "image":
              newTask = new ImageTask(
                task.taskId,
                task.displayInformation,
                task.trainingInformation
              );
              break;
            default:
              console.log("No task object available");
              break;
          }
          this.tasks.push(newTask);
          // Definition of an extension of the task-related component
          var MainDescriptionFrameSp = defineComponent({
            extends: MainDescriptionFrame,
            name: newTask.taskId.concat(".description"),
            key: newTask.taskId.concat(".description"),
          });
          var MainTrainingFrameSp = defineComponent({
            extends: MainTrainingFrame,
            name: newTask.taskId.concat(".training"),
            key: newTask.taskId.concat(".training"),
          });
          var MainTestingFrameSp = defineComponent({
            extends: MainTestingFrame,
            name: newTask.taskId.concat(".testing"),
            key: newTask.taskId.concat(".testing"),
          });
          // Add task subroutes on the go
          let newTaskRoute = {
            path: "/".concat(newTask.taskId),
            name: newTask.taskId,
            component: MainTaskFrame,
            props: { Id: newTask.taskId, Task: newTask },
            children: [
              {
                path: "description",
                name: newTask.taskId.concat(
                  ".description"
                ),
                component: MainDescriptionFrameSp,
                props: {
                  Id: newTask.taskId,
                  Task: newTask,
                },
              },
              {
                path: "training",
                name: newTask.taskId.concat(".training"),
                component: MainTrainingFrameSp,
                props: {
                  Id: newTask.taskId,
                  Task: newTask,
                },
              },
              {
                path: "testing",
                name: newTask.taskId.concat(".testing"),
                component: MainTestingFrameSp,
                props: {
                  Id: newTask.taskId,
                  Task: newTask,
                },
              },
            ],
          };
          this.$router.addRoute(newTaskRoute);
        }
      });
    for (let task of this.tasks) {
      await this.$store.commit("addTask", { task: task });
    }
  },
};
</script>
