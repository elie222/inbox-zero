import { groq } from "next-sanity";

// Get all posts
export const postsQuery = groq`*[_type == "post"] | order(_createdAt desc) {
  _createdAt,
  title,
  description,
  slug,
  mainImage,
  "imageURL": mainImage.asset->url,
  "authorName": author->name,
}`;

// Get a single post by its slug
export const postQuery = groq`*[_type == "post" && slug.current == $slug][0]{ 
    title,
    description,
    mainImage,
    markdownContent,
    body[]{
      ...,
      _type == "image" => {
        ...,
        asset->{
          ...,
          metadata
        }
      }
    },
    "authorName": author->name,
    "authorImage": author->image,
    "authorTwitter": author->twitter
  }`;

// Get all post slugs
export const postPathsQuery = groq`*[_type == "post" && defined(slug.current)][]{
    "params": { "slug": slug.current }
  }`;

// Get 4 most recent posts
export const recentPostsQuery = groq`*[_type == "post"] | order(date desc) [0...4] {
  "slug": slug.current,
  title,
  description,
  date,
  "image": mainImage.asset->url
}`;

export const postSlugsQuery = groq`*[_type == "post"] {
  "slug": slug.current,
  date
}`;
