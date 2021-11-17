<template>
  <!-- CSV tasks -->
  <!--TODO-->
  <!-- image tasks -->
  <ImageTestingFrame
    v-if="Task.trainingInformation.dataType == 'image'"
    v-bind:Id="Id"
    v-bind:Task="Task"
  />
  <CsvTestingFrame
    v-else-if="Task.trainingInformation.dataType == 'csv'"
    v-bind:Id="Id"
    v-bind:Task="Task"
  />
</template>

<script>
import ImageTestingFrame from '../building_frames/image/ImageTestingFrame';
import CsvTestingFrame from '../building_frames/csv/CsvTestingFrame';

export default {
  name: 'MainTestingFrame',
  props: {
    Id: String,
    Task: Object,
  },
  components: {
    ImageTestingFrame,
    CsvTestingFrame,
  },
  async activated() {
    this.$emit('opened-testing');
  },
};
</script>
