declare module "bencode" {
  const bencode: {
    decode(input: Buffer | Uint8Array): unknown;
    encode(input: unknown): Buffer;
  };

  export default bencode;
}
