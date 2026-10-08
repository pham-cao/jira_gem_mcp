import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const statOrNull = (p) => stat(p).catch(() => null);
/** Validate and read a local file for upload (regular file, <= 10MB). */
export async function readUploadFile(filePath) {
    const p = resolve(filePath);
    const st = await statOrNull(p);
    if (!st)
        throw new Error(`Không tìm thấy file: ${p}`);
    if (!st.isFile())
        throw new Error(`Không phải file thường: ${p}`);
    if (st.size > MAX_UPLOAD_BYTES)
        throw new Error(`File vượt quá giới hạn 10MB: ${p} (${st.size} bytes)`);
    return { path: p, blob: new Blob([await readFile(p)]), name: basename(p) };
}
/** Download `url` to a local path. Never sends credentials to another origin; `filename` is reduced to its basename. */
export async function downloadTo(client, a) {
    if (new URL(a.url).origin !== new URL(client.baseUrl).origin) {
        throw new Error(`URL tải file khác host ${client.service}, từ chối gửi thông tin đăng nhập: ${a.url}`);
    }
    let target = resolve(a.destPath);
    if ((await statOrNull(target))?.isDirectory())
        target = join(target, basename(a.filename));
    if ((await statOrNull(target)) && !a.overwrite)
        throw new Error(`File đã tồn tại: ${target} (dùng overwrite: true để ghi đè)`);
    const { data } = await client.getBinary(a.url);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, Buffer.from(data));
    return { path: target, size: data.byteLength };
}
