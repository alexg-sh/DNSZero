export interface IElectronAPI {
  checkInternet: () => void,
  onInternetStatus: (callback: (value: boolean) => void) => void,
}

declare global {
  interface Window {
    electron: IElectronAPI
  }
}
