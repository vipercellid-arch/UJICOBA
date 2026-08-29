// =========================================================================
// VIPERCELL V4 - BACKEND MUTASI OTOMATIS (ULTRA-FAST & ROBUST REST API)
// =========================================================================

const PROJECT_ID = 'vipercell-fc50e';
const API_KEY = 'AIzaSyBQGZjl7uj5CRiLWCvPQKjiK4HvIYnXSJg'; // API Key Firebase

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var judul = data.judul || "-";
    var pesan = data.pesan || "-";
    
    var teksNotifikasi = judul + " " + pesan;
    
    // Ekstraksi Nominal yang Lebih Cerdas
    var regex = /(?:Rp|IDR|Dana Masuk|Transfer|Sebesar)\s*\.?\s*([0-9]{1,3}(?:[.,][0-9]{3})*(?:[.,][0-9]+)?)/i;
    var match = teksNotifikasi.match(regex);
    
    var nominalBersih = 0;
    var statusSistem = "";
    var sukses = false;
    
    if (match) {
      var angkaKotor = match[1].replace(/[^0-9]/g, '');
      nominalBersih = parseInt(angkaKotor, 10);
      
      if (nominalBersih > 0) {
        // Panggil fungsi pencarian yang sudah diperluas untuk status UNPAID & PENDING
        var pesanan = cariPesananAktifAkurat(nominalBersih);
        
        if (pesanan) {
          var updateBerhasil = updateStatusPesananCepat(pesanan.path, "SUCCESS");
          
          if (updateBerhasil) {
            statusSistem = "SUKSES: Invoice " + pesanan.id + " (Rp" + nominalBersih + ") berhasil diverifikasi!";
            sukses = true;
          } else {
            statusSistem = "ERROR: Gagal mengupdate status invoice " + pesanan.id + " ke database.";
          }
        } else {
          statusSistem = "INFO: Tidak ada invoice UNPAID/PENDING dengan total Rp" + nominalBersih;
        }
      } else {
        statusSistem = "ABAIKAN: Nominal Rp 0";
      }
    } else {
      statusSistem = "ABAIKAN: Tidak terdeteksi format nominal (Rp/IDR) di notifikasi";
    }
    
    catatKeSheets(judul, pesan, nominalBersih, statusSistem);
    
    return ContentService.createTextOutput(JSON.stringify({
      "sukses": sukses,
      "info": statusSistem
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    catatKeSheets("CRITICAL ERROR", error.toString(), 0, "GAGAL EKSEKUSI");
    return ContentService.createTextOutput(JSON.stringify({
      "sukses": false,
      "error": error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// =========================================================================
// FUNGSI BANTUAN (FIREBASE REST API OPTIMIZED & ROBUST)
// =========================================================================

/**
 * Mencari pesanan UNPAID atau PENDING berdasarkan Total Harga (+ Kode Unik).
 * Dioptimalkan dengan Operator 'IN' pada REST API Firestore.
 */
function cariPesananAktifAkurat(nominalMasuk) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery?key=${API_KEY}`;
  
  // Payload mencari order dengan status dalam list ["UNPAID", "PENDING"]
  const payload = {
    "structuredQuery": {
      "from": [{ "collectionId": "orders" }],
      "where": {
        "fieldFilter": {
          "field": { "fieldPath": "status" },
          "op": "IN",
          "value": {
            "arrayValue": {
              "values": [
                { "stringValue": "UNPAID" },
                { "stringValue": "PENDING" }
              ]
            }
          }
        }
      }
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
    
    if (!result || result.length === 0 || !result[0].document) {
      return null;
    }
    
    for (var i = 0; i < result.length; i++) {
      if (result[i].document && result[i].document.fields) {
        var fields = result[i].document.fields;
        var dbTotal = 0;
        
        // Akali struktur angka Firestore yang bisa berupa integerValue atau doubleValue
        if (fields.finalTotal) {
          if (fields.finalTotal.integerValue) {
            dbTotal = parseInt(fields.finalTotal.integerValue, 10);
          } else if (fields.finalTotal.doubleValue) {
            dbTotal = parseInt(fields.finalTotal.doubleValue, 10);
          }
        }
        
        // Jika harga total cocok persis dengan dana masuk
        if (dbTotal === nominalMasuk) {
          return {
            path: result[i].document.name,
            id: fields.id ? fields.id.stringValue : "Unknown"
          };
        }
      }
    }
  } catch (e) {
    catatKeSheets("API FETCH ERROR", e.toString(), 0, "GAGAL BACA DB");
  }
  
  return null;
}

/**
 * Memperbarui (PATCH) field status menjadi SUCCESS
 */
function updateStatusPesananCepat(pathDokumen, statusBaru) {
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
  
  try {
    var res = UrlFetchApp.fetch(url, options);
    if (res.getResponseCode() === 200) {
      return true;
    }
  } catch (e) {}
  
  return false;
}

/**
 * Menyimpan log ke Google Sheets
 */
function catatKeSheets(judul, pesan, nominal, status) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    sheet.appendRow([new Date(), judul, pesan, nominal, status]);
  } catch (e) {}
}