<template>
  <section class="module-layout">
    <header class="module-header">
      <div>
        <h1>{{ title }}</h1>
      </div>
      <details v-if="description" class="module-description">
        <summary :aria-label="`${title}说明`" title="说明">
          <Info :size="16" />
        </summary>
        <p>{{ description }}</p>
      </details>
      <slot name="actions"></slot>
    </header>

    <nav v-if="tabs.length" class="module-tabs" aria-label="模块导航">
      <button
        v-for="tab in tabs"
        :key="tab.path"
        type="button"
        :class="{ active: isActive(tab) }"
        @click="router.push(tab.path)"
      >
        {{ tab.label }}
      </button>
    </nav>

    <div class="module-content">
      <slot>
        <router-view />
      </slot>
    </div>
  </section>
</template>

<script setup>
import { useRoute, useRouter } from 'vue-router'
import { Info } from 'lucide-vue-next'

defineProps({
  title: {
    type: String,
    required: true
  },
  description: {
    type: String,
    default: ''
  },
  tabs: {
    type: Array,
    default: () => []
  }
})

const route = useRoute()
const router = useRouter()

function isActive(tab) {
  return route.path === tab.path || route.path.startsWith(`${tab.path}/`)
}
</script>

<style lang="scss" scoped>
.module-layout {
  width: min(1160px, 100%);
  margin: 0 auto;
  animation: module-fade-in 0.26s ease both;
}

.module-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 16px;

  h1 {
    margin: 0;
    color: var(--wabi-ink);
    font-family: 'Noto Serif SC', 'Songti SC', serif;
    font-size: clamp(26px, 2vw, 32px);
    letter-spacing: 0;
  }
}

.module-description {
  position: relative;
  margin-left: auto;

  summary {
    display: grid;
    width: 34px;
    height: 34px;
    place-items: center;
    border: 1px solid var(--wabi-line);
    border-radius: 8px;
    background: rgba(251, 250, 246, 0.72);
    color: var(--wabi-muted);
    cursor: pointer;
    list-style: none;
    transition:
      background-color 0.2s ease,
      border-color 0.2s ease,
      color 0.2s ease;

    &::-webkit-details-marker {
      display: none;
    }

    &:hover {
      border-color: rgba(111, 122, 104, 0.34);
      background: rgba(251, 250, 246, 0.92);
      color: var(--wabi-moss-dark);
    }
  }

  p {
    position: absolute;
    top: 42px;
    right: 0;
    z-index: 8;
    width: min(360px, 70vw);
    margin: 0;
    border: 1px solid var(--wabi-line);
    border-radius: 8px;
    background:
      linear-gradient(135deg, rgba(255, 255, 255, 0.28), transparent 54%),
      rgba(251, 250, 246, 0.98);
    box-shadow: var(--wabi-shadow-soft);
    color: var(--wabi-ink-soft);
    line-height: 1.7;
    padding: 14px 16px;
  }
}

.module-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 18px;

  button {
    border: 1px solid var(--wabi-line);
    border-radius: 8px;
    background: rgba(251, 250, 246, 0.78);
    color: var(--wabi-muted);
    cursor: pointer;
    font: inherit;
    padding: 8px 14px;
    transition:
      background-color 0.2s ease,
      border-color 0.2s ease,
      color 0.2s ease;

    &:hover,
    &.active {
      border-color: rgba(111, 122, 104, 0.4);
      background: rgba(111, 122, 104, 0.12);
      color: var(--wabi-moss-dark);
    }
  }
}

.module-content {
  min-width: 0;
}

@keyframes module-fade-in {
  from {
    opacity: 0;
    transform: translateY(4px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
