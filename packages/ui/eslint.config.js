// Base rules only until the package contains React components; switch to
// `@docversity/config/eslint/nextjs` when the first component is added.
import { baseConfig } from '@docversity/config/eslint/base';

export default baseConfig({ tsconfigRootDir: import.meta.dirname });
