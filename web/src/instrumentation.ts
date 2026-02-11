export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    try {
      const { initSchedulers } = await import('./lib/offline-sync/service')
      await initSchedulers()
      
      const { startScheduler } = await import('./lib/online-orders/scheduler')
      startScheduler()
    } catch (e) {
      console.error('Failed to initialize offline sync schedulers:', e)
    }
  }
}
