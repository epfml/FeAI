<template>
  <div :class="{ dark: isDark }">
    <!-- Global container for the screen -->
    <div
      class="flex h-screen antialiased text-gray-900 bg-gray-100 dark:bg-dark dark:text-light"
    >
      <!-- Sidebar -->
      <aside
        class="fixed inset-y-0 z-10 flex flex-shrink-0 bg-white border-r md:static dark:border-primary-darker dark:bg-darker focus:outline-none"
        style="position: sticky"
      >
        <Sidebar v-bind:ActivePage="this.activePage" />
      </aside>

      <!-- Main Page -->
      <div class="overflow-x-scroll flex-grow">
        <router-view v-slot="{ Component }">
          <keep-alive>
            <component
              v-on:gototasks="this.activePage = 'tasks'"
              :is="Component"
            />
          </keep-alive>
        </router-view>
      </div>
    </div>
  </div>
</template>

<script>
import Sidebar from './sidebar/Sidebar.vue';
import { mapState, mapMutations } from 'vuex';

export default {
  name: 'App',
  components: {
    Sidebar,
  },
  data() {
    return {
      /**
       * Used to propagate the router view's active page to the
       * sidebar's. There might be cleaner ways of doing this.
       */
      activePage: '',
    };
  },
  computed: {
    ...mapState(['isDark']),
  },
  methods: {
    ...mapMutations(['setIndexedDB', 'setAppTheme']),
    getBrowserTheme() {
      if (window.localStorage.getItem('dark')) {
        return JSON.parse(window.localStorage.getItem('dark'));
      }
      return (
        !!window.matchMedia &&
        window.matchMedia('(prefers-color-scheme: dark)').matches
      );
    },
  },
  mounted() {
    /**
     * Use IndexedDB by default if it is available.
     */
    this.setIndexedDB(window.indexedDB);
    /**
     * Initialize the global variable "isDark" to the
     * browser-saved theme.
     */
    this.setAppTheme(this.getBrowserTheme());
  },
};
</script>
