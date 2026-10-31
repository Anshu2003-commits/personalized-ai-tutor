type JsonLdProps = {
  data: object;
};

/**
 * Renders structured data as a JSON-LD <script>. Follows the Next.js
 * recommendation: a native script tag with `<` escaped to `<` to avoid
 * XSS via injected HTML in the serialized payload.
 */
export function JsonLd({ data }: JsonLdProps) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}
