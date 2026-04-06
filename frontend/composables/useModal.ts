import { markRaw, ref } from 'vue'

let idCounter = 0

export type ModalAnimationType = 'fade' | 'slide-bottom'

type ModalItem = {
  id: number
  component: any
  props?: Record<string, any>
  animation?: ModalAnimationType
  resolve: (data: any) => void
}

const modals = ref<ModalItem[]>([])

export const useModal = () => {
  /**
   * Open a modal with optional animation type
   * @param component - The modal component to render
   * @param props - Optional props to pass to the modal component
   * @param animation - Animation type: 'fade' (default) or 'slide-bottom'
   * @returns Promise that resolves when modal is closed
   */
  const open = (component: any, props?: Record<string, any>, animation: ModalAnimationType = 'fade') => {
    return new Promise(resolve => {
      modals.value.push({
        id: ++idCounter,
        component: markRaw(component),
        props,
        animation,
        resolve,
      })
    })
  }

  const close = (id: number, result?: any) => {
    const index = modals.value.findIndex(m => m.id === id)
    if (index !== -1 && modals.value[index]) {
      modals.value[index].resolve(result)
      modals.value.splice(index, 1)
    }
  }

  return { modals, open, close }
}
