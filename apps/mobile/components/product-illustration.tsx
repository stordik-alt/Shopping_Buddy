import { useState } from 'react'
import { Image, View } from 'react-native'
import { SvgXml } from 'react-native-svg'
import { productVisualFor } from '../../../lib/product-visuals'
import type { ItemCategory } from '../../../lib/types'
import illustrations from '../lib/product-illustrations.json'
import { getApiUrl } from '../lib/config'

type Props = {
  productTypeKey: string | null
  category: ItemCategory | null
  subcategory: string | null
  size: number
  imageToken: string | null
}

export function ProductIllustration({ productTypeKey, category, subcategory, size, imageToken }: Props) {
  const [failedImageKey, setFailedImageKey] = useState<string | null>(null)
  const visual = productVisualFor({ productTypeKey, category, subcategory })
  const xml = illustrations[`${visual.shape}:${visual.tint}` as keyof typeof illustrations] ?? illustrations['basket:grey']

  const imageUri = productTypeKey && imageToken && failedImageKey !== productTypeKey
    ? `${getApiUrl()}/api/mobile/product-types/${encodeURIComponent(productTypeKey)}/image`
    : null

  return (
    <View accessibilityElementsHidden style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <SvgXml xml={xml} width="100%" height="100%" />
      {imageUri ? (
        <Image
          onError={() => setFailedImageKey(productTypeKey)}
          resizeMode="contain"
          source={{ uri: imageUri, headers: { Authorization: `Bearer ${imageToken}` } }}
          style={{ position: 'absolute', width: '100%', height: '100%' }}
        />
      ) : null}
    </View>
  )
}
