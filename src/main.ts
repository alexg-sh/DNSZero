import { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import isDev from 'electron-is-dev';
import sudo from 'sudo-prompt';
import { exec } from 'child_process';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  app.quit();
}

// Declare Vite globals
declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string;
declare const MAIN_WINDOW_VITE_NAME: string;

let tray: Tray | null = null;
let currentDns: string | null = null;

const dnsServers = [
  { name: 'Google', address: '8.8.8.8' },
  { name: 'Cloudflare', address: '1.1.1.1' },
  { name: 'OpenDNS', address: '208.67.222.222' },
  { name: 'Quad9', address: '9.9.9.9' },
];

const createWindow = () => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    show: false, // Hide the main window by default
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }
};


// Execute shell commands with elevated privileges using sudo-prompt
const execWithSudo = async (
  command: string
): Promise<{ success: boolean; output: string; error?: string }> => {
  return new Promise((resolve) => {
    // For macOS, include proper options for Authorization Services
    const options: any = { 
      name: 'DNS Switcher'
    };
    
    // On macOS, try to use the app icon for Authorization Services dialog
    if (process.platform === 'darwin') {
      // Try different icon paths
      const possibleIconPaths = [
        path.join(app.getAppPath(), 'assets', 'icon.icns'),
        path.join(process.resourcesPath, 'icon.icns'),
        '/System/Library/CoreServices/CoreTypes.bundle/Contents/Resources/NetworkIcon.icns'
      ];
      
      for (const iconPath of possibleIconPaths) {
        if (fs.existsSync(iconPath)) {
          options.icns = iconPath;
          break;
        }
      }
    }
    
    sudo.exec(command, options, (error: Error | null, stdout: string, stderr: string) => {
      if (error) {
        console.error('sudo-prompt error:', error);
        return resolve({ success: false, output: '', error: error.message });
      }
      resolve({ success: true, output: stdout });
    });
  });
};

const getCurrentDns = (): Promise<string | null> => {
  return new Promise(async (resolve) => {
    const result = await execWithSudo('networksetup -getdnsservers Wi-Fi');
    if (!result.success) {
      console.error('Failed to get current DNS:', result.error);
      resolve(null);
      return;
    }
    
    const currentDnsServer = result.output.trim().split('\n')[0];
    resolve(currentDnsServer);
  });
};

const updateTrayMenu = () => {
  if (!tray) return;
  
  const contextMenu = Menu.buildFromTemplate([
    ...dnsServers.map(server => ({
      label: `${server.name} (${server.address})`,
      type: 'radio' as const,
      checked: currentDns === server.address,
      click: () => {
        changeDns(server.address);
      }
    })),
    { type: 'separator' },
    { 
      label: 'Check Current DNS', 
      click: async () => {
        const dns = await getCurrentDns();
        console.log('Current DNS:', dns);
        currentDns = dns;
        updateTrayMenu();
      }
    },
    { 
      label: 'Configure Passwordless Access', 
      click: async () => {
        await configureNoPassword();
      }
    },
    { label: 'Quit', click: () => app.quit() }
  ]);

  tray.setContextMenu(contextMenu);
};

const createTray = () => {
  // Create a simple programmatic icon as fallback
  const createFallbackIcon = () => {
    // Create a 16x16 icon with a simple design
    const size = 16;
    const buffer = Buffer.alloc(size * size * 4); // RGBA
    
    // Fill with a blue color (DNS theme)
    for (let i = 0; i < buffer.length; i += 4) {
      buffer[i] = 70;     // R
      buffer[i + 1] = 130; // G
      buffer[i + 2] = 200; // B
      buffer[i + 3] = 255; // A
    }
    
    return nativeImage.createFromBuffer(buffer, { width: size, height: size });
  };

  // Try to load custom icon, fall back to programmatic one
  let icon: Electron.NativeImage;
  
  const iconPath = isDev
    ? path.join(app.getAppPath(), 'assets', 'icon.png')
    : path.join(process.resourcesPath, 'icon.png');
  
  console.log('Looking for icon at:', iconPath);
  
  // Check if file exists and is readable before trying to load it
  if (fs.existsSync(iconPath)) {
    try {
      icon = nativeImage.createFromPath(iconPath);
      
      // Check if the icon was loaded successfully
      if (icon.isEmpty()) {
        console.warn('Icon file exists but is empty, using fallback');
        icon = createFallbackIcon();
      } else {
        console.log('Successfully loaded icon from file');
      }
    } catch (error) {
      console.warn('Failed to load custom icon, using fallback:', error);
      icon = createFallbackIcon();
    }
  } else {
    console.warn(`Icon file not found at ${iconPath}, using fallback`);
    icon = createFallbackIcon();
  }
  
  try {
    tray = new Tray(icon);
    tray.setToolTip('DNS Switcher');
    console.log('Tray created successfully');
    
    // Initialize current DNS and update menu
    getCurrentDns().then(dns => {
      currentDns = dns;
      updateTrayMenu();
      console.log('Tray menu updated with current DNS:', dns);
    });
  } catch (error) {
    console.error('Failed to create tray:', error);
  }
};

const changeDns = async (dnsAddress: string) => {
  try {
    // Get all network services without sudo to avoid multiple prompts
    exec('networksetup -listallnetworkservices', (err, stdout, stderr) => {
      if (err) {
        console.error('Failed to list network services:', stderr || err);
        return;
      }
      const services = stdout.split('\n')
        .slice(1)
        .filter((line: string) => line.trim() && !line.startsWith('*'))
        .map((line: string) => line.trim())
        .filter(service => service !== 'Thunderbolt Bridge' && service !== 'iPhone USB');
      
      // Build combined DNS set commands
      const commands = services.map(service => `networksetup -setdnsservers "${service}" ${dnsAddress}`);
      const fullCommand = commands.join(' && ');
      console.log('Executing combined DNS command:', fullCommand);

      execWithSudo(fullCommand).then(result => {
        if (result.success) {
          console.log(`DNS changed successfully for all services to ${dnsAddress}`);
          currentDns = dnsAddress;
          updateTrayMenu();
          // Optional: verify for first service
          const verifyService = services[0];
          if (verifyService) {
            setTimeout(() => {
              execWithSudo(`networksetup -getdnsservers "${verifyService}"`).then(verifyResult => {
                if (verifyResult.success) {
                  console.log(`Current DNS for ${verifyService}:`, verifyResult.output.trim());
                }
              });
            }, 1000);
          }
        } else {
          console.error('Failed to change DNS:', result.error);
        }
      });
    });
  } catch (error) {
    console.error('Error in changeDns:', error);
  }
};

const configureNoPassword = async () => {
  try {
    // Create a more comprehensive sudoers rule
    const networkSetupPath = '/usr/sbin/networksetup';
    const sudoersContent = `# DNS Switcher - Allow networksetup without password
${process.env.USER} ALL=(ALL) NOPASSWD: ${networkSetupPath}
${process.env.USER} ALL=(ALL) NOPASSWD: ${networkSetupPath} *`;
    
    const tempFile = '/tmp/dnsswitcher_sudoers';
    const commands = [
      `echo '${sudoersContent}' > ${tempFile}`,
      `visudo -c -f ${tempFile}`,
      `cp ${tempFile} /etc/sudoers.d/dnsswitcher`,
      `chmod 440 /etc/sudoers.d/dnsswitcher`,
      `rm ${tempFile}`
    ];
    
    const fullCommand = commands.join(' && ');
    console.log('Configuring passwordless sudo for networksetup...');
    
    const result = await execWithSudo(fullCommand);
    if (result.success) {
      console.log('✅ Sudoers configuration successful! Future DNS changes won\'t require password.');
      
      // Show success notification
      const { dialog } = require('electron');
      dialog.showMessageBox({
        type: 'info',
        title: 'Success',
        message: 'Passwordless DNS switching configured!',
        detail: 'Future DNS changes will not require a password prompt.'
      });
      
      updateTrayMenu();
    } else {
      console.error('Failed to configure sudoers:', result.error);
      
      // Show error notification
      const { dialog } = require('electron');
      dialog.showErrorBox('Configuration Failed', 
        `Failed to configure passwordless access: ${result.error}`);
    }
  } catch (error) {
    console.error('Error in configureNoPassword:', error);
  }
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', () => {
  console.log('App is ready, creating tray...');
  createTray();
  createWindow();
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

ipcMain.on('check-internet', (event) => {
    // Simple check, more robust check might be needed
    import('dns').then(dns => {
        dns.lookup('google.com', (err) => {
            event.reply('internet-status', !err);
        });
    });
});
