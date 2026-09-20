import * as React from 'react'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Text,
} from '@react-email/components'
import {
  emailBrand,
  emailButton,
  emailContainer,
  emailFooter,
  emailHeading,
  emailLink,
  emailMain,
  emailText,
} from './brand'

interface SignupEmailProps {
  siteName: string
  siteUrl: string
  recipient: string
  confirmationUrl: string
}

export const SignupEmail = ({
  siteName,
  siteUrl,
  recipient,
  confirmationUrl,
}: SignupEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head>
      <style>{darkModeCss}</style>
    </Head>
    <Preview>Confirm your email for {siteName}</Preview>
    <Body style={emailMain}>
      <Container style={emailContainer}>
        <Text style={emailBrand}>VERUNDA TEAM SCOUTIER</Text>
        <Heading style={emailHeading}>Confirm your email</Heading>
        <Text style={emailText}>
          Thanks for signing up for{' '}
          <Link href={siteUrl} style={emailLink}>
            <strong>{siteName}</strong>
          </Link>
          !
        </Text>
        <Text style={emailText}>
          Please confirm your email address (
          <Link href={`mailto:${recipient}`} style={emailLink}>
            {recipient}
          </Link>
          ) by clicking the button below:
        </Text>
        <Button style={emailButton} href={confirmationUrl}>
          Confirm email
        </Button>
        <Text style={emailFooter}>
          If you didn't create an account, you can safely ignore this email.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default SignupEmail

// Rendered as a text child, which React may HTML-escape: keep this CSS free of >, &, and quotes.
const darkModeCss = `
  @media (prefers-color-scheme: dark) {
    .dm-btn { background-color: #ffffff !important; color: #000000 !important; }
  }
  [data-ogsc] .dm-btn { background-color: #ffffff !important; color: #000000 !important; }
  [data-ogsb] .dm-btn { background-color: #ffffff !important; color: #000000 !important; }
`
