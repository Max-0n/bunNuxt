<template lang="pug">
  teleport(to="body")
    TransitionGroup(@after-enter="afterEnterHandler")
      .modal(
        v-for="modal in modals"
        :key="modal.id"
        :ref="(el) => modalRefs.set(modal.id, el)"
      )
        Transition(name="fade")
          .modal-overlay(
            v-if="isElementVisible(modalRefs.get(modal.id))"
            @click.self="handleClose(modal.id)"
          )
        Transition(
          :name="modal.animation || 'fade'"
          @after-leave="beforeLeaveHandler(modal.id)"
        )
          component(
            v-if="isElementVisible(modalRefs.get(modal.id))"
            :is="modal.component"
            v-bind="modal.props"
            @close="handleClose(modal.id)"
            @resolve="(data) => handleClose(modal.id, data)"
          )
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useModal } from '@/composables/useModal'

const { modals, close } = useModal()

const modalRefs = ref(new Map<number, Element>())
const modalElementsSet = ref(new Set<Element>())
const pendingClosesPayload = ref(new Map<number, any>())

const isElementVisible = (element: Element) => modalElementsSet.value.has(element)

const handleClose = (modalId: number, data?: any) => {
  const element = modalRefs.value.get(modalId)
  if (element) {
    modalElementsSet.value.delete(element)
    pendingClosesPayload.value.set(modalId, data)
  }
}

const afterEnterHandler = (el: Element) => {
  modalElementsSet.value.add(el)
}
const beforeLeaveHandler = (modalId: number) => {
  close(modalId, pendingClosesPayload.value.get(modalId))
}
</script>

<style lang="scss" scoped>
.modal {
  position: fixed;
  top: 0;
  left: 0;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  z-index: 1000;

  &-overlay {
    position: absolute;
    top: 0;
    left: 0;
    inset: 0;
    background-color: var(--color-black-050);
    backdrop-filter: blur(7px);
  }
}

// Modal component fade animation
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

// Modal component slide-bottom animation
.slide-bottom-enter-active,
.slide-bottom-leave-active {
  transition: all 0.3s ease;
}
.slide-bottom-enter-from,
.slide-bottom-leave-to {
  transform: translateY(100%);
}
</style>
