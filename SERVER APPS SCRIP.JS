// =========================================================================
// VIPERCELL V4 - BACKEND MUTASI OTOMATIS (ULTRA-FAST REST API)
// =========================================================================

const PROJECT_ID = 'vipercell-fc50e';
const API_KEY = 'AIzaSyBQGZjl7uj5CRiLWCvPQKjiK4HvIYnXSJg'; // API Key Firebase kamu

function doPost(e) {
  try {
    // 1. Tangkap data dari webhook (MacroDroid) secepat mungkin
    var data = JSON.parse(e.postData.contents);
    var judul = data.judul || "-";
    var pesan = data.pesan || "-";
    
    // Gabungkan judul dan pesan untuk memperluas area pencarian angka
    var teksNotifikasi = judul + " " + pesan;
    
    // 2. Ekstraksi Nominal (Cari angka setelah kata Rp/IDR/Dana Masuk/Transfer)
    // Regex ini dirancang kebal terhadap spasi atau titik pemisah ribuan
    var regex = /(?:Rp|IDR|Dana Masuk|Transfer)\s*\.?\s*([0-9.,]+)/i;
    var match = teksNotifikasi.match(regex);
    
    var nominalBersih = 0;
    var statusSistem = "";
    var sukses = false;
    
    if (match) {
      // Bersihkan titik dan koma agar menjadi angka murni (integer)
      nominalBersih = parseInt(match[1].replace(/[^0-9]/g, ''), 10);
      
      if (nominalBersih > 0) {
        
        // 3. Pengecekan Kilat ke Database Firebase
        var pesanan = cariPesananUnpaidCepat(nominalBersih);
        
        if (pesanan) {
          // 4. Update status ke SUCCESS secepat kilat (Hanya mengubah field status)
          // Catatan: Setelah ini berubah, Front-End (js/store.js) akan bereaksi instan
          // dan langsung mengirimkan stok akun ke pembeli.
          updateStatusPesananCepat(pesanan.path, "SUCCESS");
          
          statusSistem = "SUKSES: Invoice " + pesanan.id + " berhasil diverifikasi!";
          sukses = true;
        } else {
          statusSistem = "INFO: Tidak ada invoice UNPAID dengan total Rp" + nominalBersih;
        }
        
      } else {
        statusSistem = "ABAIKAN: Nominal Rp 0";
      }
    } else {
      statusSistem = "ABAIKAN: Tidak terdeteksi nominal angka di notifikasi";
    }
    
    // 5. Pencatatan Asinkron ke Google Sheets (Agar tidak menunda respon)
    catatKeSheets(judul, pesan, nominalBersih, statusSistem);
    
    // 6. Kembalikan Response JSON yang sangat ringan ke aplikasi MacroDroid
    return ContentService.createTextOutput(JSON.stringify({
      "sukses": sukses,
      "info": statusSistem
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    // Penanganan Error yang Aman
    catatKeSheets("ERROR SISTEM", error.toString(), 0, "GAGAL EKSEKUSI");
    
    return ContentService.createTextOutput(JSON.stringify({
      "sukses": false,
      "error": error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// =========================================================================
// FUNGSI BANTUAN (FIREBASE REST API OPTIMIZED)
// =========================================================================

/**
 * Mencari pesanan UNPAID berdasarkan Total Harga dengan fitur LIMIT 1
 */
function cariPesananUnpaidCepat(nominalMasuk) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery?key=${API_KEY}`;
  
  // Payload ini dioptimasi agar server Google Firestore tidak perlu melooping semua data
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
      "limit": 1 // Super cepat karena akan berhenti mencari setelah menemukan 1 hasil
    }
  };
  
  const options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  
  try {
    const response = UrlFetchApp.fetch(url, options);
    const result = JSON.parse(response.getContentText());
    
    // Cek apakah dokumen ditemukan
    if (result && result.length > 0 && result[0].document) {
      const docPath = result[0].document.name;
      const fields = result[0].document.fields;
      return {
        path: docPath, // Format path document untuk diupdate
        id: fields.id ? fields.id.stringValue : "Unknown"
      };
    }
  } catch (e) {
    // Meredam error agar fungsi webhook utama tidak terhenti (crash)
  }
  return null;
}

/**
 * Memperbarui (PATCH) satu field saja tanpa menimpa data lain
 */
function updateStatusPesananCepat(pathDokumen, statusBaru) {
  // Hanya menargetkan field 'status' sehingga payload data sangat kecil (<1KB)
  const url = `https://firestore.googleapis.com/v1/${pathDokumen}?updateMask.fieldPaths=status&key=${API_KEY}`;
  
  const payload = {
    "fields": {
      "status": { "stringValue": statusBaru }
    }
  };
  
  const options = {
    method: "patch",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  
  UrlFetchApp.fetch(url, options);
}

/**
 * Menyimpan log ke Google Sheets
 */
function catatKeSheets(judul, pesan, nominal, status) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    sheet.appendRow([new Date(), judul, pesan, nominal, status]);
  } catch (e) {
    // Abaikan jika penulisan sheet gagal atau timeout
  }
}