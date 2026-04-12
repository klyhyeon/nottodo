import { useEffect, useState } from 'react'

interface ToastProps {
  message: string
  visible: boolean
  onClose: () => void
}

export default function Toast({ message, visible, onClose }: ToastProps) {
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (visible) {
      setShow(true)
      const timer = setTimeout(() => {
        setShow(false)
        setTimeout(onClose, 300)
      }, 2500)
      return () => clearTimeout(timer)
    }
  }, [visible, onClose])

  if (!visible && !show) return null

  return (
    <div className={`fixed top-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 bg-primary text-white rounded-full text-sm font-semibold shadow-lg transition-opacity duration-300 ${show ? 'opacity-100' : 'opacity-0'}`}>
      {message}
    </div>
  )
}
