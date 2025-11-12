interface PlayProps {
  className?: string;
}

export function Play({ className }: PlayProps) {
  return (
    <svg
      width="18"
      height="21"
      viewBox="0 0 18 21"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <g filter="url(#filter0_i_481_2380)">
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M4.65195 1.34353C3.13127 0.414205 2.37091 -0.0504543 1.74447 0.00434357C1.19831 0.0521186 0.698977 0.332166 0.373419 0.773273C0 1.27924 0 2.17034 0 3.95253V16.6253C0 18.4075 0 19.2986 0.373419 19.8046C0.698977 20.2457 1.19831 20.5258 1.74447 20.5736C2.37091 20.6283 3.13127 20.1637 4.65195 19.2343L15.0207 12.8979C16.4322 12.0353 17.1379 11.604 17.3786 11.0488C17.5887 10.5639 17.5887 10.0139 17.3786 9.52913C17.1379 8.97389 16.4322 8.54258 15.0207 7.67994L4.65195 1.34353Z"
          fill="url(#paint0_linear_481_2380)"
        />
      </g>
      <path
        d="M1.7666 0.25293C2.00983 0.231763 2.30586 0.309425 2.75293 0.529297C3.19858 0.748503 3.75721 1.08957 4.52148 1.55664L14.8906 7.89355C15.6002 8.32717 16.1177 8.64342 16.4893 8.91992C16.8613 9.19683 17.0554 9.41211 17.1494 9.62891C17.3318 10.0501 17.3318 10.528 17.1494 10.9492C17.0554 11.166 16.8613 11.3803 16.4893 11.6572C16.1177 11.9338 15.6004 12.2508 14.8906 12.6846L4.52148 19.0215C3.75721 19.4885 3.19858 19.8296 2.75293 20.0488C2.30583 20.2687 2.00984 20.3454 1.7666 20.3242C1.2919 20.2827 0.857188 20.0397 0.574219 19.6562C0.429249 19.4598 0.341438 19.1671 0.295898 18.6709C0.250518 18.1762 0.25 17.521 0.25 16.625V3.95215C0.25 3.05633 0.250529 2.40181 0.295898 1.90723C0.341419 1.41105 0.429305 1.11838 0.574219 0.921875C0.857187 0.538474 1.2919 0.294455 1.7666 0.25293Z"
        strokeWidth="0.5"
      />
      <defs>
        <filter
          id="filter0_i_481_2380"
          x="0"
          y="0"
          width="17.5371"
          height="23.3779"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feBlend
            mode="normal"
            in="SourceGraphic"
            in2="BackgroundImageFix"
            result="shape"
          />
          <feColorMatrix
            in="SourceAlpha"
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
            result="hardAlpha"
          />
          <feOffset dy="4" />
          <feGaussianBlur stdDeviation="1.4" />
          <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1" />
          <feColorMatrix
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.25 0"
          />
          <feBlend
            mode="normal"
            in2="shape"
            result="effect1_innerShadow_481_2380"
          />
        </filter>
        <linearGradient
          id="paint0_linear_481_2380"
          x1="8.76807"
          y1="0"
          x2="8.76807"
          y2="20.5779"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#212121" />
          <stop offset="1" stopColor="#656565" />
        </linearGradient>
      </defs>
    </svg>
  );
}
