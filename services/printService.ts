
import { Transaction, StoreSettings } from "../types";

export class PrintService {
  private device: any | null = null;
  private characteristic: any | null = null;

  async connect() {
    if (!('bluetooth' in navigator)) {
      throw new Error("Web Bluetooth tidak didukung di browser ini. Gunakan Google Chrome atau Edge.");
    }

    try {
      if (!this.device) {
        this.device = await (navigator as any).bluetooth.requestDevice({
          acceptAllDevices: true,
          optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb', '4953434d-fe7d-4ae5-8fa9-9fafd205e455']
        });

        this.device.addEventListener('gattserverdisconnected', () => {
          console.warn("Bluetooth Disconnected. Attempting to reconnect on next action.");
          this.characteristic = null;
        });
      }

      if (!this.isConnected) {
        const server = await this.device.gatt?.connect();
        const services = await server?.getPrimaryServices();
        
        if (!services) throw new Error("Tidak ada layanan Bluetooth ditemukan.");

        this.characteristic = null;
        for (const service of services) {
          const chars = await service.getCharacteristics();
          for (const char of chars) {
            if (char.properties.write || char.properties.writeWithoutResponse) {
              this.characteristic = char;
              break;
            }
          }
          if (this.characteristic) break;
        }
      }

      if (!this.characteristic) throw new Error("Printer tidak mendukung thermal protocol.");
      return this.device.name || "Printer Terhubung";
    } catch (error: any) {
      this.characteristic = null;
      throw error;
    }
  }

  async ensureConnected() {
    if (this.isConnected) return true;
    if (this.device) {
      try {
        await this.connect();
        return true;
      } catch (e) {
        return false;
      }
    }
    return false;
  }

  get isConnected() {
    return !!this.characteristic && this.device?.gatt?.connected;
  }

  async printReceipt(tx: Transaction, settings: StoreSettings, isCopy: boolean = false) {
    if (!this.isConnected) {
      const reconnected = await this.ensureConnected();
      if (!reconnected) {
        alert("Printer Thermal Bluetooth terputus! Silakan hubungkan kembali di menu Settings.");
        return;
      }
    }

    const encoder = new TextEncoder();
    const ESC = '\x1B';
    const GS = '\x1D';
    const center = ESC + 'a' + '\x01';
    const left = ESC + 'a' + '\x00';
    const boldOn = ESC + 'E' + '\x01';
    const boldOff = ESC + 'E' + '\x00';
    const init = ESC + '@';
    const cut = GS + 'V' + '\x41' + '\x03';

    let content = init + center + boldOn + settings.name.toUpperCase() + boldOff + '\n';
    content += settings.address + '\n';
    content += '--------------------------------\n';
    
    if (isCopy) {
      content += boldOn + "*** STRUK SALINAN ***" + boldOff + '\n';
      content += '--------------------------------\n';
    }

    content += left;
    content += `ID   : #${tx.id.slice(-8).toUpperCase()}\n`;
    content += `TGL  : ${new Date(tx.timestamp).toLocaleString('id-ID')}\n`;
    content += `KASIR: ${tx.staffId}\n`;
    content += `CUST : ${tx.customerName || 'UMUM'}\n`;
    content += `PAY  : ${tx.paymentStatus === 'PAID' ? 'TERBAYAR (LUNAS)' : 'BELUM BAYAR (PIUTANG)'}\n`;
    content += '--------------------------------\n';

    tx.items.forEach(item => {
      content += `${item.name.toUpperCase()}\n`;
      const original = item.originalPrice || item.price;
      const isDiscounted = original > item.price;
      
      content += `${item.quantity} x ${item.price.toLocaleString()}   Rp${item.subtotal.toLocaleString()}\n`;
      if (isDiscounted) {
        const discPerItem = original - item.price;
        const totalDisc = discPerItem * item.quantity;
        content += `(DISKON Rp${totalDisc.toLocaleString()})\n`;
      }
    });

    content += '--------------------------------\n';
    content += boldOn + `TOTAL: Rp${tx.total.toLocaleString()}` + boldOff + '\n';
    content += `METODE: ${tx.paymentMethod}\n`;
    
    // CETAK CATATAN JIKA ADA
    if (tx.notes) {
      content += `CATATAN: ${tx.notes}\n`;
    }
    
    content += '--------------------------------\n';
    content += center + settings.footer + '\n\n\n\n' + cut;

    try {
      const data = encoder.encode(content);
      const chunkSize = 20; // Ukuran chunk data Bluetooth
      for (let i = 0; i < data.length; i += chunkSize) {
        await this.characteristic.writeValue(data.slice(i, i + chunkSize));
      }
    } catch (error) {
      console.error("Printing Error:", error);
    }
  }

  async printPriceTag(product: any, settings: StoreSettings) {
    if (!this.isConnected) {
      const reconnected = await this.ensureConnected();
      if (!reconnected) {
        // Fallback to standard browser print
        window.print();
        return;
      }
    }

    const encoder = new TextEncoder();
    const ESC = '\x1B';
    const GS = '\x1D';
    const init = ESC + '@';
    const center = ESC + 'a' + '\x01';
    const left = ESC + 'a' + '\x00';
    const right = ESC + 'a' + '\x02';
    const boldOn = ESC + 'E' + '\x01';
    const boldOff = ESC + 'E' + '\x00';
    const doubleWidthOn = ESC + '!' + '\x20';
    const doubleSizeOn = ESC + '!' + '\x30';
    const normalSize = ESC + '!' + '\x00';
    const cut = GS + 'V' + '\x41' + '\x03';

    // Periksa apakah sedang diskon
    let isPromo = false;
    const basePrice = Number(product.price || 0);
    const discVal = Number(product.discountValue || 0);
    let finalPrice = basePrice;
    const now = new Date();
    
    if (discVal > 0) {
      // Handle potential differences in property naming (lowercase/camelCase)
      const startStr = product.discountStart || product.discount_start;
      const endStr = product.discountEnd || product.discount_end;
      const start = startStr ? new Date(startStr) : null;
      const end = endStr ? new Date(endStr) : null;

      if (end) end.setHours(23, 59, 59, 999);
      if ((!start || start <= now) && (!end || end >= now)) {
        isPromo = true;
        const dType = (product.discountType || product.discount_type || 'FIXED').toString().toUpperCase();
        if (dType === 'PERCENT' || dType === 'PERCENTAGE') {
          finalPrice = basePrice * (1 - discVal / 100);
        } else {
          finalPrice = Math.max(0, basePrice - discVal);
        }
      }
    }

    let content = init + center;
    
    // Header Promo & Periode
    if (isPromo) {
      content += boldOn + "[ PROMO ]" + boldOff + '\n';
      // Harga Coret (Normal)
      content += "NORMAL: Rp " + basePrice.toLocaleString('id-ID') + '\n';
    }

    // Harga Utama (Besar) - Menggunakan Math.round untuk harga bersih
    content += "Rp " + doubleSizeOn + boldOn + Math.round(finalPrice).toLocaleString('id-ID') + boldOff + normalSize + '\n';
    
    // Nama Barang
    const name = (product.name || '').toUpperCase();
    content += boldOn + name.substring(0, 32) + boldOff + '\n';
    if (name.length > 32) {
      content += boldOn + name.substring(32, 64) + boldOff + '\n';
    }

    // SKU / PLU & Tgl Cetak
    const printDate = new Date().toLocaleDateString('id-ID', {day: '2-digit', month: '2-digit', year: '2-digit'}).replace(/\//g, '');
    content += (product.sku || '').toUpperCase() + "  " + printDate + '\n';

    // 1D Barcode Print via Thermal ESC/POS (CODE39 / JAN / CODE128)
    const rawBarcode = (product.barcode || product.sku || '').toString().trim().toUpperCase();
    if (rawBarcode) {
      const cleanCode39 = rawBarcode.replace(/[^A-Z0-9\-\.\ \$\/\+\%]/g, '');
      if (cleanCode39.length > 0) {
        const setHeight = GS + 'h' + '\x38'; // 56 dots height
        const setWidth = GS + 'w' + '\x02';  // module width 2
        const setHRI = GS + 'H' + '\x02';    // HRI text below
        const barcodeData = GS + 'k' + '\x04' + cleanCode39 + '\x00'; // CODE39
        content += setHeight + setWidth + setHRI + barcodeData + '\n';
      }
    }
    
    if (isPromo) {
      content += boldOn + "--- PROMO ---" + boldOff + '\n';
    }

    content += '\n' + cut;

    try {
      const data = encoder.encode(content);
      const chunkSize = 20;
      for (let i = 0; i < data.length; i += chunkSize) {
        await this.characteristic.writeValue(data.slice(i, i + chunkSize));
      }
    } catch (error) {
      console.error("Printing Price Tag Error:", error);
    }
  }
}

export default new PrintService();
