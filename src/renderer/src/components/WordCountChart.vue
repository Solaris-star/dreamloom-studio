<template>
  <div class="chart-area">
    <div v-if="chartError" class="chart-error" role="alert">
      <span>{{ chartError }}</span>
      <button type="button" :disabled="chartLoading" @click="updateChartData">
        {{ t('common.retry') }}
      </button>
    </div>
    <div ref="chartRef" class="chart-container"></div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { statisticsService } from '@renderer/service/statisticsService'
import { echarts } from '@renderer/utils/barEcharts'

defineProps({
  height: {
    type: String,
    default: '200px'
  }
})

const chartRef = ref(null)
const chartError = ref('')
const chartLoading = ref(false)
let chart = null
const { t } = useI18n()

// 获取最近30天的日期数组
function getLast30Days() {
  const dates = []
  for (let i = 29; i >= 0; i--) {
    const date = new Date()
    date.setDate(date.getDate() - i)
    dates.push(date.toISOString().split('T')[0])
  }
  return dates
}

// 初始化图表
function initChart() {
  if (!chartRef.value) return

  chart = echarts.init(chartRef.value)
  const dates = getLast30Days()

  // 设置图表配置
  const option = {
    title: {
      text: t('wordCountChart.title'),
      left: 'center',
      textStyle: {
        // color: 'var(--text-base)',
        fontSize: 15
      }
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'shadow'
      },
      formatter: (params) => {
        const data = params[0]
        const value = data.value
        const sign = value >= 0 ? '+' : ''
        return `${data.name}<br/>${data.seriesName}: ${sign}${value}${t('wordCountChart.wordUnit')}`
      }
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: dates,
      axisLabel: {
        // color: 'var(--text-base)',
        formatter: (value) => value.slice(5) // 只显示月-日
      }
    },
    yAxis: {
      type: 'value',
      name: t('wordCountChart.axisName'),
      axisLabel: {
        // color: 'var(--text-base)'
      }
    },
    series: [
      {
        name: t('wordCountChart.dailyWords'),
        type: 'bar',
        data: new Array(30).fill(0),
        itemStyle: {
          color: '#409EFF'
        }
      }
    ]
  }

  chart.setOption(option)

  // 监听窗口大小变化
  window.addEventListener('resize', handleResize)
}

// 更新图表数据
async function updateChartData() {
  if (!chart && chartRef.value) {
    initChart()
  }
  if (!chart) return

  chartLoading.value = true
  chartError.value = ''
  try {
    const stats = await statisticsService.getAllBooksDailyStats()
    const dates = getLast30Days()
    const netWordsData = dates.map((date) => {
      let totalNetWords = 0
      Object.values(stats).forEach((bookStats) => {
        const dayStats = bookStats?.[date]
        if (dayStats && typeof dayStats === 'object') {
          totalNetWords += Number(dayStats.netWords || 0)
        }
      })
      return totalNetWords
    })

    chart.setOption({
      series: [
        {
          name: t('wordCountChart.dailyNetWords'),
          data: netWordsData
        }
      ]
    })
  } catch (error) {
    chartError.value = error?.message || t('wordCountChart.fetchFailed')
    console.error(t('wordCountChart.fetchFailedLog'), error)
  } finally {
    chartLoading.value = false
  }
}

// 处理窗口大小变化
function handleResize() {
  chart && chart.resize()
}

// 暴露更新方法
defineExpose({
  updateData: updateChartData
})

onMounted(() => {
  initChart()
  updateChartData()
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  chart && chart.dispose()
})
</script>

<style lang="scss" scoped>
.chart-area {
  background: var(--bg-soft);
  border-radius: 8px;

  .chart-error {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 12px 0;
    color: var(--el-color-danger);
    font-size: 12px;

    button {
      border: 1px solid rgba(64, 158, 255, 0.35);
      border-radius: 6px;
      background: transparent;
      color: var(--el-color-primary);
      cursor: pointer;
      font: inherit;
      padding: 4px 8px;
      white-space: nowrap;

      &:disabled {
        cursor: default;
        opacity: 0.6;
      }
    }
  }

  .chart-container {
    width: 100%;
    height: v-bind('height');
  }
}
</style>
