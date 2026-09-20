import * as React from 'react'

import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
} from '@react-email/components'
import { emailBrand, emailCode, emailContainer, emailFooter, emailHeading, emailMain, emailText } from './brand'

interface ReauthenticationEmailProps {
  token: string
}

export const ReauthenticationEmail = ({ token }: ReauthenticationEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your verification code</Preview>
    <Body style={emailMain}>
      <Container style={emailContainer}>
        <Text style={emailBrand}>VERUNDA TEAM SCOUTIER</Text>
        <Heading style={emailHeading}>Confirm it’s you</Heading>
        <Text style={emailText}>Use this code to confirm your identity:</Text>
        <Text style={emailCode}>{token}</Text>
        <Text style={emailFooter}>
          This code will expire shortly. If you didn't request this, you can
          safely ignore this email.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default ReauthenticationEmail

