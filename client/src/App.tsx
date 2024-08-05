import "./App.css";
import { Input } from "@/components/ui/input";
import { Button } from "./components/ui/button";
import { useState } from "react";
import ky from "ky";

const api = ky.create({
  prefixUrl: "https://zpntf97glj.execute-api.us-east-1.amazonaws.com",
  timeout: 180000,
});

function App() {
  const [file, setFile] = useState<File>();
  const [key, setKey] = useState("");
  const [downloadUrl, setDownloadUrl] = useState("");
  const [quality, setQuality] = useState(80);

  const handleCompress = async () => {
    if (!key) return;

    const res = await api
      .get(`compress-image?key=${key}`)
      .json<{ objectURL: string }>();

    setDownloadUrl(res.objectURL);
  };

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];

    setFile(file);

    if (!file) return;

    const params = {
      fileName: encodeURIComponent(file.name),
      contentType: encodeURIComponent(file.type),
    };

    const query = new URLSearchParams(params).toString();

    const res = await api
      .get(`generate-upload-url?${query}`)
      .json<{ uploadUrl: string }>();

    const uploadUrl = res.uploadUrl;

    await ky.put(uploadUrl, {
      body: file,
      headers: {
        "Content-Type": file?.type,
      },
    });

    setKey(new URL(uploadUrl).pathname);
  };

  return (
    <main className="flex justify-center items-center min-w-96">
      <div className="flex flex-col gap-5">
        <Input
          type="file"
          onChange={handleChange}
          accept="image/jpeg, image/png"
        />

        <Input
          type="number"
          max={100}
          min={0}
          maxLength={3}
          value={quality}
          onInput={(e) => {
            const num = Number(e.currentTarget.value);
            if (num < 0 || num > 100) return;
            setQuality(num);
          }}
        />

        <Button
          disabled={!file}
          onClick={() => {
            handleCompress();
          }}
        >
          Upload
        </Button>

        <Button variant="link" disabled={!downloadUrl}>
          Download
        </Button>
      </div>
    </main>
  );
}

export default App;
