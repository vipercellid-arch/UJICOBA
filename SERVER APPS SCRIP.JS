// Konfigurasi Database Firebase Vipercell
const PROJECT_ID = 'vipercell-fc50e';
const API_KEY = 'AIzaSyBQGZjl7uj5CRiLWCvPQKjiK4HvIYnXSJg';

function doPost(e) {
  try {
    // 1. Tangkap data dari MacroDroid secepat mungkin sebelum proses lain
    var data = JSON.parse(e.postData.contents);
    var judul = data.judul || "-";
    var pesan = data.pesan || "-";
    
    var teksNotifikasi = judul + " " + pesan;
    
    // --- PROSES MENCARI ANGKA NOMINAL (REGEX) ---
    var regex = /(?:Rp|IDR)\s*\.?\s*([0-9.,]+)/i;
    var match = teksNotifikasi.match(regex);
    
    var nominalBersih = 0;
    var statusSistem = "";
    
    if (match) {
      nominalBersih = parseInt(match[1].replace(/[^0-9]/g, ''), 10);
      
      if (nominalBersih > 0) {
        // --- CEK KE FIREBASE (VERSI CEPAT) ---
        var pesanan = cariPesananUnpaidCepat(nominalBersih);
        
        if (pesanan) {
          // Update status ke SUCCESS secara langsung & kilat
          updateStatusPesananCepat(pesanan.path, "SUCCESS", "Pesanan berhasil diproses otomatis oleh Bot QRIS.");
          statusSistem = "SUKSES FIREBASE: Invoice " + pesanan.id + " berhasil diproses!";
        } else {
          statusSistem = "INFO: Tidak ada invoice UNPAID dengan total Rp" + nominalBersih;
        }
        
      } else {
        statusSistem = "ABAIKAN: Nominal Rp 0";
      }
    } else {
      statusSistem = "ABAIKAN: Tidak terdeteksi kata Rp/IDR di notifikasi";
    }
    
    // 2. Kirim respon sukses SECEPAT MUNGKIN ke MacroDroid agar tidak timeout
    var outputRespon = ContentService.createTextOutput(JSON.stringify({ "sukses": true, "info": statusSistem }))
      .setMimeType(ContentService.MimeType.JSON);
    
    // 3. Catat ke Google Sheets secara asynchronous / di akhir setelah respon terkirim
    // Menggunakan try-catch terpisah agar log sheet tidak menghambat kecepatan webhook
    try {
      var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
      sheet.appendRow([new Date(), judul, pesan, nominalBersih, statusSistem]);
    } catch (sheetErr) {
      // Abaikan jika sheet ganguan kecil agar tidak memblokir bot
    }
    
    return outputRespon;
    
  } catch (error) {
    // Penanganan Error Cepat
    try {
      var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
      sheet.appendRow([new Date(), "ERROR SISTEM", error.toString(), "", "GAGAL"]);
    } catch (err) {}
    
    return ContentService.createTextOutput(JSON.stringify({ "sukses": false, "error": error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}


// =========================================================================
// FUNGSI KOMUNIKASI KE FIREBASE (DIOPTIMASI AGAR LEBIH CEPAT)
// =========================================================================

function cariPesananUnpaidCepat(nominalMasuk) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery?key=${API_KEY}`;
  
  // Payload query yang disederhanakan agar eksekusi di server Google lbh ringan
  const payload = {
    "structuredQuery": {
      "from": [{ "collectionId": "orders" }],
      "where": {
        "compositeFilter": {
          "op": "AND",
          "filters": [
            { "fieldFilter": { "field": { "fieldPath": "status" }, "op": "EQUAL", "value": { "stringValue": "UNPAID" } } },
            { "fieldFilter": { "field": { "fieldPath": "finalTotal" }, "op": "EQUAL", "value": { "integerValue": nominalMasuk } } }
          ]
        }
      },
      "limit": 1
    }
  };
  
  const options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
    useIntrospection: false // Mempercepat parse payload
  };
  
  try {
    const response = UrlFetchApp.fetch(url, options);
    const result = JSON.parse(response.getContentText());
    
    if (result && result.length > 0 && result[0].document) {
      const docPath = result[0].document.name;
      const fields = result[0].document.fields;
      return {
        path: docPath,
        id: fields.id ? fields.id.stringValue : "Tidak Diketahui"
      };
    }
  } catch (e) {
    console.error("Error Fetch Firebase: " + e.toString());
  }
  return null;
}

function updateStatusPesananCepat(pathDokumen, statusBaru, balasan) {
  // Hanya memperbarui field yang benar-benar diperlukan untuk memangkas ukuran data kirim (payload)
  const url = `https://firestore.googleapis.com/v1/${pathDokumen}?updateMask.fieldPaths=status&updateMask.fieldPaths=adminReply&key=${API_KEY}`;
  
  const payload = {
    "fields": {
      "status": { "stringValue": statusBaru },
      "adminReply": { "stringValue": balasan }
    }
  };
  
  const options = {
    method: "patch",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  
  // Eksekusi asinkron kilat
  UrlFetchApp.fetch(url, options);
}