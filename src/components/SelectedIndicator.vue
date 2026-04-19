<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useGameState } from '../stores/useGameState'

const gameState = useGameState()
const { t } = useI18n()
// 这里简单显示类型，后续可根据 type 查表显示名称
const selectedBuilding = computed(() => gameState.selectedBuilding)
const selectedBuildingLabel = computed(() =>
  selectedBuilding.value
    ? `${selectedBuilding.value.type?.toUpperCase()} (${t('selectedIndicator.levelShort')}.${selectedBuilding.value.level})`
    : t('selectedIndicator.none'),
)
</script>

<template>
  <div v-if="selectedBuilding" class="absolute top-4 right-4 resource-display rounded px-3 py-1">
    <span class="text-xs text-gray-400 uppercase tracking-wide">{{ t('selectedIndicator.selected') }}:</span>
    <span class="text-sm font-bold text-industrial-blue ml-2">{{ selectedBuildingLabel }}</span>
  </div>
</template>
