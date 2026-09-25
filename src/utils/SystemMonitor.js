import si from 'systeminformation';

export class SystemMonitor {
  constructor(logger) {
    this.logger = logger;
    this.lastCpuUsage = null;
    this.lastTimestamp = null;
  }

  start() {
    // Start monitoring
    setInterval(() => this.getResourceUsage(), 10000);
    this.logger.info('System monitor started');
  }

  async getSystemInfo() {
    try {
      const osInfo = await si.osInfo();
      const cpuInfo = await si.cpu();
      const memInfo = await si.mem();
      const diskInfo = await si.diskLayout();

      return {
        os: {
          platform: osInfo.platform,
          distro: osInfo.distro,
          release: osInfo.release
        },
        cpu: {
          manufacturer: cpuInfo.manufacturer,
          brand: cpuInfo.brand,
          cores: cpuInfo.cores,
          physicalCores: cpuInfo.physicalCores,
          speedMax: cpuInfo.speedMax
        },
        memory: {
          total: memInfo.total,
          available: memInfo.available,
          used: memInfo.used,
          free: memInfo.free,
          usagePercent: ((memInfo.used / memInfo.total) * 100).toFixed(2)
        },
        disk: diskInfo.map(d => ({
          device: d.device,
          type: d.type,
          size: d.size
        }))
      };
    } catch (error) {
      this.logger.error({ error }, 'Failed to get system info');
      return null;
    }
  }

  async getResourceUsage() {
    try {
      const processes = await si.processes();
      const load = await si.currentLoad();
      const memInfo = await si.mem();
      const networkStats = await si.networkStats();

      return {
        cpu: {
          usage: load.currentLoad.toFixed(2),
          cores: load.cpus.map(c => ({
            load: c.load.toFixed(2)
          }))
        },
        memory: {
          total: memInfo.total,
          used: memInfo.used,
          available: memInfo.available,
          free: memInfo.free,
          usagePercent: ((memInfo.used / memInfo.total) * 100).toFixed(2),
          swapUsed: memInfo.swapused,
          swapTotal: memInfo.swaptotal
        },
        processes: {
          running: processes.running,
          sleeping: processes.sleeping,
          list: processes.list.slice(0, 10).map(p => ({
            pid: p.pid,
            name: p.name,
            cpu: p.cpu.toFixed(2),
            memory: p.memory
          }))
        },
        network: networkStats.map(n => ({
          iface: n.iface,
          rx_bytes: n.rx_bytes,
          tx_bytes: n.tx_bytes,
          rx_packets: n.rx_packets,
          tx_packets: n.tx_packets
        }))
      };
    } catch (error) {
      this.logger.error({ error }, 'Failed to get resource usage');
      return null;
    }
  }

  async getNetworkInterfaces() {
    try {
      const interfaces = await si.networkInterfaces();
      return interfaces;
    } catch (error) {
      this.logger.error({ error }, 'Failed to get network interfaces');
      return null;
    }
  }

  async getUptime() {
    try {
      const uptime = await si.time();
      return {
        uptime: uptime.uptime,
        uptime_pretty: uptime.uptime_pretty
      };
    } catch (error) {
      this.logger.error({ error }, 'Failed to get uptime');
      return null;
    }
  }
}
