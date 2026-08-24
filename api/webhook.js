export default function handler(req, res) {
  // Pastikan hanya menerima metode POST
  if (req.method === 'POST') {
    // Menangkap data JSON yang dikirim dari MacroDroid
    const { judul, pesan } = req.body;

    console.log("Notifikasi QRIS Masuk!");
    console.log("Judul:", judul);
    console.log("Pesan/Nominal:", pesan);

    // Di sinilah nanti kamu bisa menambahkan logika lanjutan.
    // Misalnya: mengekstrak angka dari teks pesan, mencocokkannya
    // dengan ID pesanan, lalu mengupdate status di database (seperti Firebase).

    // Mengirimkan respons sukses kembali ke MacroDroid
    return res.status(200).json({ success: true, message: 'Data berhasil diterima oleh Vipercell' });
  } else {
    // Jika ada yang mencoba mengakses dengan metode GET/lainnya
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ success: false, message: 'Metode tidak diizinkan' });
  }
}
