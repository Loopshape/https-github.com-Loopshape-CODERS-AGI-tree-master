#!/bin/bash
echo "test" > ~/.fake.hash
openssl pkeyutl -sign -inkey ~/.ssh/nemodian -in ~/.fake.hash -out /trip.sig
