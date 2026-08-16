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
        "https://cdn.example",
        "my-bucket",
      ),
    ).toBe("photo/x.jpg");
  });

  it("extracts key from path-style URL when bucket matches", () => {
    expect(
      extractObjectKeyFromUrl(
        "https://storage.example/my-bucket/photo/y.jpg",
        "https://other.example",
        "my-bucket",
      ),
    ).toBe("photo/y.jpg");
  });

  it("throws when URL shape is unrecognized", () => {
    expect(() =>
      extractObjectKeyFromUrl(
        "https://evil.example/not-our-bucket/photo/z.jpg",
        "https://cdn.example",
        "my-bucket",
      ),
    ).toThrow("Cannot extract object key from media URL");
  });
});
