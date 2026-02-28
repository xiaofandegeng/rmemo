<script setup lang="ts">
import { onMounted, ref } from "vue";
import { fetchUsers, toggleUserStatus, type UserItem } from "../../api/user";

const keyword = ref("");
const list = ref<UserItem[]>([]);

async function load() {
  list.value = await fetchUsers(keyword.value);
}

async function toggle(item: UserItem) {
  await toggleUserStatus(item.id);
  await load();
}

onMounted(load);
</script>

<template>
  <section>
    <h1>User Management Demo</h1>
    <input v-model="keyword" placeholder="Search by name/phone" @input="load" />
    <ul>
      <li v-for="item in list" :key="item.id">
        <span>{{ item.name }} ({{ item.phone }})</span>
        <button @click="toggle(item)">
          {{ item.enabled ? "Disable" : "Enable" }}
        </button>
      </li>
    </ul>
  </section>
</template>
