<template>
  <div class="stat-card">
    <div class="card-content">
      <div class="info">
        <div class="title">{{ title }}</div>
        <div class="value-row">
          <span class="value" :style="{ color: color }">{{ formattedValue }}</span>
          <span class="unit">{{ unit }}</span>
        </div>
      </div>
      <div class="icon-box" :style="{ backgroundColor: `${color}15`, color: color }">
        <component :is="lucideIcon" :size="24" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import * as icons from 'lucide-vue-next'

const props = defineProps({
  title: String,
  value: [Number, String],
  unit: String,
  icon: String,
  color: {
    type: String,
    default: '#6f7a68'
  }
})

const lucideIcon = computed(() => icons[props.icon])

const formattedValue = computed(() => {
  if (typeof props.value === 'number') {
    return props.value.toLocaleString()
  }
  return props.value || '0'
})
</script>

<style lang="scss" scoped>
.stat-card {
  background:
    linear-gradient(145deg, rgba(251, 250, 246, 0.94), rgba(232, 229, 223, 0.5)),
    var(--bg-soft);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 20px;
  box-shadow: var(--wabi-shadow-soft, 0 14px 32px rgba(58, 55, 49, 0.06));
  transition: transform 0.22s ease, border-color 0.22s ease;

  &:hover {
    transform: translateY(-2px);
    border-color: rgba(111, 122, 104, 0.24);
  }

  .card-content {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .info {
    .title {
      font-size: 13px;
      color: var(--text-gray);
      margin-bottom: 8px;
    }
    .value-row {
      display: flex;
      align-items: baseline;
      gap: 4px;
      .value {
        font-size: 24px;
        font-weight: bold;
      }
      .unit {
        font-size: 12px;
        color: var(--text-gray);
      }
    }
  }

  .icon-box {
    width: 48px;
    height: 48px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
}
</style>
