import {
  buildPublicObjectUrl,
  extractObjectKeyFromUrl,
} from "./storage-url.utils";

describe("storage-url.utils", () => {
  it("builds public URL without duplicate slashes", () => {
    expect(
      buildPublicObjectUrl(
        "https://storage.yandexcloud.net/my-bucket/",
        "/photo/a.jpg",
      ),
    ).toBe("https://storage.yandexcloud.net/my-bucket/photo/a.jpg");
  });

  it("extracts key using configured public base (Yandex path-style)", () => {
    const base = "https://storage.yandexcloud.net/my-bucket";
    expect(
      extractObjectKeyFromUrl(
        `${base}/photo/uuid_thumbnail.webp`,
        base,
        "my-bucket",
      ),
    ).toBe("photo/uuid_thumbnail.webp");
  });

  it("extracts key from legacy amazonaws virtual-host URL", () => {
    expect(
      extractObjectKeyFromUrl(
        "https://my-bucket.s3.amazonaws.com/photo/x.jpg",
        "https://my-bucket.s3.amazonaws.com",
        "my-bucket",
      ),
    ).toBe("photo/x.jpg");
  });
});
